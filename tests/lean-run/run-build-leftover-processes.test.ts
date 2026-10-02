/**
 * Tests for how runBuild ends when processes it started may still run: the
 * lock is released only once every owned process is confirmed gone, and
 * otherwise stays `unconfirmed` and refuses the next run until they exit or
 * the caller clears it. Real processes, in a temporary git repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runningPids } from "../../lib/lean-run/cleanup-check.ts";
import type { RefreshFileGraph } from "../../lib/lean-run/graph-refresh.ts";
import {
	type RunBuildOptions,
	runBuild,
	runReview,
} from "../../lib/lean-run/run-build.ts";
import { summarizeRun } from "../../lib/lean-run/summary.ts";
import type {
	BuilderBackend,
	RunRecord,
	SignalProvider,
} from "../../lib/lean-run/types.ts";
import {
	type ListProcesses,
	listProcesses,
} from "../../lib/process/process-tree.ts";
import { runChild } from "../../lib/process/run-child.ts";

const PLAN_PATH = "missions/lean/demo/plan.md";
const PLAN = "# Demo\n\n## Approach\nGreet.\n\n## Touches\n- `src/greet.ts`\n";
const DONE = '{"outcome":"done","summary":"built","touched":["src/greet.ts"]}';
const REVIEW = '{"outcome":"done","summary":"fine","findings":[]}';

/**
 * Ignores SIGTERM, which its children inherit, and leaves two grandchildren
 * still in its tree at the first listing: a `sleep` orphaned at once by its
 * subshell (re-parented, still in the shell's group) and a perl daemon in a
 * session of its own.
 */
const LEFTOVER_SCRIPT = [
	'trap "" TERM',
	'echo "shell $$"',
	'( sleep 30 & echo "orphan $!" )',
	"perl -e 'use POSIX; POSIX::setsid() or die; $| = 1; print \"detached $$\\n\"; sleep 60 while 1;' &",
	"wait",
].join("\n");

/**
 * A double-fork daemon: the first child leaves the session and forks the
 * daemon, which writes its pid to ARGV[0] and keeps ARGV[1] (a path in the
 * clone) on its command line. The parent exits only once that file exists,
 * so its group is empty when it exits: the runner lists nothing and the
 * daemon is never in the tree. A daemon that dies first leaves no file, so
 * the parent gives up after 5 s and says so on stderr.
 */
const DAEMON_SCRIPT = [
	"use POSIX;",
	'if (fork) { for (1 .. 250) { exit 0 if -e $ARGV[0]; select(undef, undef, undef, 0.02); } die "daemon wrote no pid file within 5 s\\n"; }',
	"POSIX::setsid() or die;",
	"fork and exit;",
	'open(my $f, ">", "$ARGV[0].tmp") or die; print $f "$$\\n"; close $f;',
	'rename("$ARGV[0].tmp", $ARGV[0]) or die;',
	"close STDOUT; close STDERR; close STDIN;",
	"sleep 30;",
].join(" ");

let root: string;
let scratch: string;
const leftovers: number[] = [];
/** One test points `TMPDIR` into `scratch`; a timed-out run would leave it there. */
const originalTmpdir = process.env.TMPDIR;

function git(...args: string[]): string {
	return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "lean-run-leftovers-"));
	scratch = await mkdtemp(join(tmpdir(), "lean-run-leftovers-logs-"));
	git("init", "-q", "-b", "main");
	git("config", "user.email", "test@example.com");
	git("config", "user.name", "Test");
	git("config", "commit.gpgsign", "false");
	await mkdir(join(root, "missions/lean/demo"), { recursive: true });
	await mkdir(join(root, "src"));
	await writeFile(join(root, ".gitignore"), "missions/sessions/\n");
	await writeFile(join(root, PLAN_PATH), PLAN);
	await writeFile(join(root, "src/greet.ts"), "export const greet = 1;\n");
	git("add", "-A");
	git("commit", "-q", "-m", "base");
});

afterEach(async () => {
	restoreTmpdir();
	killAll(leftovers.splice(0));
	await rm(root, { recursive: true, force: true });
	await rm(scratch, { recursive: true, force: true });
});

function restoreTmpdir(): void {
	if (originalTmpdir === undefined) delete process.env.TMPDIR;
	else process.env.TMPDIR = originalTmpdir;
}

function killAll(pids: readonly number[]): void {
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Already gone.
		}
	}
}

async function waitUntilGone(pids: readonly number[]): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const { running } = await runningPids(pids, { list: listProcesses });
		if (running.length === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`still running: ${pids.join(", ")}`);
}

function lockPath(): string {
	return join(root, ".git/lean-run/lock");
}

async function readLock(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(lockPath(), "utf8"));
}

function backend(text: string, edit = false): BuilderBackend {
	return {
		kind: "pi",
		async run(input) {
			if (edit)
				await writeFile(
					join(input.worktree, "src/greet.ts"),
					'export const greet = "hi";\n',
				);
			return { text };
		},
	};
}

async function waitForMatch(path: string, pattern: RegExp): Promise<number> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const text = await readFile(path, "utf8").catch(() => "");
		const match = pattern.exec(text);
		if (match) return Number(match[1]);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`no ${String(pattern)} in ${path}`);
}

interface Leftovers {
	shell: number;
	orphan: number;
	detached: number;
}

/**
 * A builder whose child process tree outlives the stage: it starts the
 * leftover script through the child runner, waits for every pid, then
 * aborts the run. The runner's SIGTERM is ignored and its grace is long, so
 * the stage-exit ceiling passes first.
 */
function leftoverBuilder(
	controller: AbortController,
	started: Partial<Leftovers>,
): BuilderBackend {
	return {
		kind: "pi",
		async run(input) {
			const stdout = join(scratch, "leftover.stdout.log");
			const run = runChild({
				command: "sh",
				args: ["-c", LEFTOVER_SCRIPT],
				cwd: input.worktree,
				output: { stdout, stderr: join(scratch, "leftover.stderr.log") },
				...(input.signal ? { signal: input.signal } : {}),
				graceMs: 60_000,
			});
			started.shell = await waitForMatch(stdout, /shell (\d+)\n/u);
			started.orphan = await waitForMatch(stdout, /orphan (\d+)\n/u);
			started.detached = await waitForMatch(stdout, /detached (\d+)\n/u);
			leftovers.push(started.shell, started.orphan, started.detached);
			controller.abort(new Error("stop"));
			await run;
			return { text: DONE };
		},
	};
}

const verify: SignalProvider = {
	kind: "verify",
	run: async () => ({
		kind: "verify",
		status: "pass",
		summary: "tests pass",
		data: { exitCode: 0 },
		reenter: false,
	}),
};

const refreshGraph: RefreshFileGraph = async () => ({
	outcome: "current",
	graph: {
		schemaVersion: 1,
		projectHash: "p",
		graphHash: "g",
		nodes: [{ path: "src/greet.ts", kind: "source", exports: [] }],
		edges: [],
	},
});

/**
 * The real listing, tried up to three times: under load one `ps` can pass
 * its 1 s bound, and a run whose last listing fails skips the detached scan.
 */
const patientListing: ListProcesses = async () => {
	let listing = await listProcesses();
	for (let tries = 1; tries < 3 && listing instanceof Error; tries += 1)
		listing = await listProcesses();
	return listing;
};

function build(extra: Partial<RunBuildOptions> = {}): Promise<RunRecord> {
	return runBuild({
		projectRoot: root,
		planPath: PLAN_PATH,
		backend: backend(DONE, true),
		reviewerBackend: backend(REVIEW),
		providers: [verify],
		requiredSignals: [],
		refreshGraph,
		...extra,
	});
}

/** A run whose builder leaves the leftover tree running past the stage-exit ceiling. */
async function buildWithLeftovers(): Promise<{
	record: RunRecord;
	pids: number[];
	started: Leftovers;
}> {
	const controller = new AbortController();
	const started: Partial<Leftovers> = {};
	const record = await build({
		backend: leftoverBuilder(controller, started),
		signal: controller.signal,
		stageExitCeilingMs: 100,
		cleanupConfirmMs: 300,
	});
	const { shell, orphan, detached } = started;
	if (!shell || !orphan || !detached) throw new Error("leftovers not started");
	const pids = [shell, orphan, detached].sort((a, b) => a - b);
	return { record, pids, started: { shell, orphan, detached } };
}

function parentOf(pid: number): number {
	return Number(
		execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], {
			encoding: "utf8",
		}).trim(),
	);
}

describe.skipIf(process.platform === "win32")(
	"runBuild with processes that outlive the run",
	() => {
		test("keeps the lock unconfirmed, refuses the next run, and proceeds once they are gone", async () => {
			const { record, pids, started } = await buildWithLeftovers();

			// The orphan left its parent before the runner listed the tree.
			expect(parentOf(started.orphan)).not.toBe(started.shell);
			expect(record.manifest.status).toBe("failed");
			expect(record.manifest.cleanupUnconfirmed).toEqual(pids);
			expect(record.manifest.reason).toContain(
				`cleanup unconfirmed: pids ${pids.join(", ")}`,
			);
			expect(await readLock()).toMatchObject({
				runId: record.manifest.id,
				state: "unconfirmed",
				unconfirmedPids: pids,
			});

			const refused = await build();

			expect(refused.manifest.status).toBe("blocked");
			expect(refused.manifest.reason).toMatch(
				new RegExp(
					`^previous run cleanup unconfirmed \\(pids ${pids.join(", ")}\\)`,
				),
			);

			killAll(pids);
			await waitUntilGone(pids);
			const next = await build();

			expect(next.manifest.status).toBe("done");
			expect(next.manifest.warnings).toContain(
				`previous run ${record.manifest.id} left cleanup unconfirmed (pids ${pids.join(", ")}); all have exited, so its lock was cleared`,
			);
			expect(existsSync(lockPath())).toBe(false);
		}, 30_000);

		test("with clearStaleLock, proceeds while the previous run's processes still run", async () => {
			const { record, pids } = await buildWithLeftovers();

			const next = await build({ clearStaleLock: true });

			expect(next.manifest.status).toBe("done");
			expect(next.manifest.cleanupUnconfirmed).toBeUndefined();
			expect(next.manifest.warnings).toContain(
				`clearStaleLock: cleared previous run ${record.manifest.id}'s unconfirmed lock (pids ${pids.join(", ")}) while pids ${pids.join(", ")} still run`,
			);
			expect(existsSync(lockPath())).toBe(false);
		}, 30_000);

		test("releases the lock without waiting when every process it started is gone", async () => {
			let listings = 0;
			const counted: ListProcesses = () => {
				listings += 1;
				return listProcesses();
			};
			const builder: BuilderBackend = {
				kind: "pi",
				async run(input) {
					await runChild({
						command: "sh",
						args: ["-c", "echo built"],
						cwd: input.worktree,
						output: {
							stdout: join(scratch, "built.stdout.log"),
							stderr: join(scratch, "built.stderr.log"),
						},
					});
					return backend(DONE, true).run(input);
				},
			};
			const started = Date.now();

			const record = await build({
				backend: builder,
				listProcesses: counted,
				cleanupConfirmMs: 30_000,
			});

			expect(record.manifest.status).toBe("done");
			expect(record.manifest.cleanupUnconfirmed).toBeUndefined();
			expect(existsSync(lockPath())).toBe(false);
			// One listing, for detached candidates; no polling.
			expect(listings).toBe(1);
			expect(Date.now() - started).toBeLessThan(10_000);
		}, 30_000);

		test("reports processes that name the builder clone as detached candidates, never owned", async () => {
			let clone = "";
			const builder: BuilderBackend = {
				kind: "pi",
				async run(input) {
					clone = input.worktree;
					return backend(DONE, true).run(input);
				},
			};
			const listing: ListProcesses = async () => [
				{
					pid: 9_000_001,
					ppid: 1,
					pgid: 9_000_001,
					stat: "S",
					command: `node ${clone}/node_modules/.bin/vitest --watch`,
				},
				{
					pid: 9_000_002,
					ppid: 1,
					pgid: 9_000_002,
					stat: "S",
					command: "node elsewhere.js",
				},
				{
					pid: 9_000_003,
					ppid: 1,
					pgid: 9_000_003,
					stat: "Z",
					command: `sh ${clone}/x`,
				},
			];

			const record = await build({
				backend: builder,
				listProcesses: listing,
			});

			expect(record.manifest.status).toBe("done");
			expect(record.manifest.detachedCandidates).toEqual([
				{
					pid: 9_000_001,
					command: `node ${clone}/node_modules/.bin/vitest --watch`,
				},
			]);
			expect(record.manifest.cleanupUnconfirmed).toBeUndefined();
			expect(
				record.manifest.warnings?.some((warning) =>
					warning.startsWith("detached process candidates:"),
				),
			).toBe(true);
			expect(existsSync(lockPath())).toBe(false);
			expect((await build()).manifest.status).toBe("done");
		}, 30_000);

		test("reports a real daemon re-parented before any listing as a detached candidate", async () => {
			// The clone is made under a symlinked temp directory and the daemon
			// names its real path, which does not contain the linked one.
			const realTmp = join(scratch, "real-tmp");
			const linkedTmp = join(scratch, "linked-tmp");
			await mkdir(realTmp);
			await symlink(realTmp, linkedTmp);
			const pidFile = join(scratch, "daemon.pid");
			const stderr = join(scratch, "daemon.stderr.log");
			let clone = "";
			let realClone = "";
			const builder: BuilderBackend = {
				kind: "pi",
				async run(input) {
					clone = input.worktree;
					realClone = await realpath(input.worktree);
					await runChild({
						command: "perl",
						args: ["-e", DAEMON_SCRIPT, pidFile, `${realClone}/daemon-marker`],
						cwd: input.worktree,
						output: { stdout: join(scratch, "daemon.stdout.log"), stderr },
					});
					if (!existsSync(pidFile))
						throw new Error(
							`daemon not started: ${await readFile(stderr, "utf8")}`,
						);
					const daemon = await waitForMatch(pidFile, /^(\d+)\n/u);
					leftovers.push(daemon);
					return backend(DONE, true).run(input);
				},
			};
			process.env.TMPDIR = linkedTmp;
			let record: RunRecord;
			try {
				record = await build({
					backend: builder,
					listProcesses: patientListing,
				});
			} finally {
				restoreTmpdir();
			}

			const [daemon] = leftovers;
			expect(record.manifest.reason).toBeUndefined();
			if (!daemon) throw new Error("daemon not started");
			expect(clone.startsWith(linkedTmp)).toBe(true);
			expect(realClone.includes(clone)).toBe(false);
			expect(
				record.manifest.detachedCandidates,
				`warnings: ${JSON.stringify(record.manifest.warnings)}`,
			).toEqual([{ pid: daemon, command: expect.stringContaining(realClone) }]);
			expect(record.manifest.cleanupUnconfirmed).toBeUndefined();
			expect(record.manifest.status).toBe("done");
			expect(summarizeRun(record)).toContain(
				`1 detached process candidate(s) still name the builder clone, not confirmed gone: pids ${daemon} (`,
			);
			expect(summarizeRun(record)).toContain(`${realClone.slice(-30)}...)`);
			expect(existsSync(lockPath())).toBe(false);
			expect((await build()).manifest.status).toBe("done");
		}, 30_000);

		test("warns that descendants were not enumerated when a tree listing fails", async () => {
			const builder: BuilderBackend = {
				kind: "pi",
				async run(input) {
					await runChild({
						command: "sh",
						args: ["-c", "sleep 5 & exit 0"],
						cwd: input.worktree,
						output: {
							stdout: join(scratch, "unlisted.stdout.log"),
							stderr: join(scratch, "unlisted.stderr.log"),
						},
						listProcesses: async () => new Error("ps failed"),
					});
					return backend(DONE, true).run(input);
				},
			};

			const record = await build({
				backend: builder,
				listProcesses: async () => new Error("ps failed"),
			});

			expect(record.manifest.status).toBe("done");
			expect(record.manifest.cleanupUnconfirmed).toBeUndefined();
			expect(record.manifest.warnings).toEqual(
				expect.arrayContaining([
					expect.stringMatching(
						/^process trees unverified: the descendants of pid \d+ at builder-1 \(.*\) could not be enumerated, so they are not confirmed gone and the run lock does not wait for them$/u,
					),
					"detached process scan skipped: no process listing (Windows has none, or ps failed)",
				]),
			);
			expect(existsSync(lockPath())).toBe(false);
		}, 30_000);

		test("lean review: refused by an unconfirmed lock, proceeds with clearStaleLock", async () => {
			const { record } = await buildWithLeftovers();
			await writeFile(join(root, "src/greet.ts"), "export const greet = 2;\n");
			const review = (extra: { clearStaleLock?: boolean } = {}) =>
				runReview({
					projectRoot: root,
					reviewerBackend: backend(REVIEW),
					providers: [verify],
					requiredSignals: [],
					refreshGraph,
					...extra,
				});

			const refused = await review();

			expect(refused.manifest.status).toBe("blocked");
			expect(refused.manifest.reason).toMatch(
				/^previous run cleanup unconfirmed \(pids /u,
			);

			const cleared = await review({ clearStaleLock: true });

			expect(cleared.manifest.status).toBe("done");
			expect(
				cleared.manifest.warnings?.some((warning) =>
					warning.startsWith(
						`clearStaleLock: cleared previous run ${record.manifest.id}'s unconfirmed lock`,
					),
				),
			).toBe(true);
			expect(existsSync(lockPath())).toBe(false);
		}, 30_000);
	},
);
