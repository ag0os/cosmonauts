/**
 * Tests for how runBuild ends when processes it started may still run: the
 * lock is released only once every owned process is confirmed gone, and
 * otherwise stays `unconfirmed` and refuses the next run until they exit or
 * the caller clears it. Real processes, in a temporary git repository.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runningPids } from "../../lib/lean-run/cleanup-check.ts";
import type { RefreshFileGraph } from "../../lib/lean-run/graph-refresh.ts";
import {
	type RunBuildOptions,
	runBuild,
} from "../../lib/lean-run/run-build.ts";
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

let root: string;
let scratch: string;
const leftovers: number[] = [];

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
	killAll(leftovers.splice(0));
	await rm(root, { recursive: true, force: true });
	await rm(scratch, { recursive: true, force: true });
});

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

function build(extra: Partial<RunBuildOptions> = {}): Promise<RunRecord> {
	return runBuild({
		projectRoot: root,
		planPath: PLAN_PATH,
		backend: backend(DONE, true),
		reviewerBackend: backend(REVIEW),
		providers: [verify],
		// Only verify runs here; the default required kinds would block every run.
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
	},
);
