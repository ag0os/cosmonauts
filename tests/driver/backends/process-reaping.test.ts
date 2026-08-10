import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCodexBackend } from "../../../lib/driver/backends/codex.ts";
import type { DriverEvent } from "../../../lib/driver/types.ts";
import { useTempDir } from "../../helpers/fs.ts";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const temp = useTempDir("process-reaping-");

/**
 * The backends call `Bun.spawn`, which only exists under Bun, and every other
 * backend suite stubs it away. Reaping is precisely the behaviour a stub cannot
 * model, so these tests drive the real backend inside a real `bun` process and
 * read back what it observed at the moment `run()` settled.
 */
interface HarnessObservation {
	exitCode: number;
	stdout: string;
	settledMs: number;
	descendantPid: number;
	descendantAliveAtSettle: boolean;
}

type HarnessOutcome =
	| { settled: true; observation: HarnessObservation }
	| { settled: false; descendantPid: number | undefined };

const spawnedDescendants = new Set<number>();
const spawnedBackendGroups = new Set<number>();

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Teardown reaps what the harness left behind. `tests/helpers/fs.ts` retries rm
 * on ENOTEMPTY, so a straggler would otherwise vanish silently instead of
 * failing the suite.
 */
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	for (const pid of spawnedBackendGroups) {
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// The reap under test is expected to have emptied the group already.
		}
	}
	spawnedBackendGroups.clear();
	for (const pid of spawnedDescendants) {
		if (isAlive(pid)) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Already reaped between the liveness probe and the signal.
			}
		}
	}
	spawnedDescendants.clear();
});

/**
 * A backend binary that starts a descendant outliving it, then exits cleanly —
 * the shape codex presented on 2026-08-05. `holdsPipes` selects whether the
 * descendant inherits stdout/stderr (which blocks the backend's drain) or
 * redirects them (which leaks silently).
 */
async function writeLeakyBackend(
	binDir: string,
	options: { holdsPipes: boolean; ignoreSigterm?: boolean },
): Promise<string> {
	const path = join(binDir, "leaky-backend");
	const pidPath = join(binDir, "..", "descendant.pid");
	const readyPath = join(binDir, "..", "descendant.ready");
	const redirect = options.holdsPipes ? "" : ">/dev/null 2>&1 </dev/null";

	// The SIGTERM-ignoring shape must *respawn* its sleep, matching
	// `spawnSigtermIgnoringSentinel` in the detached-driver suite. A plain
	// `bash -c 'trap "" TERM; sleep 60'` does not survive a group SIGTERM: the
	// sleep is signalled directly, bash's wait returns, and bash exits normally,
	// so the group empties on SIGTERM and escalation is never exercised.
	const sentinelPath = join(binDir, "sigterm-sentinel");
	await writeFile(
		sentinelPath,
		`#!/usr/bin/env bash
trap '' TERM
printf 'ready\\n' > "$1"
while true; do
  sleep 0.05
done
`,
		"utf-8",
	);
	await chmod(sentinelPath, 0o755);

	const descendant = options.ignoreSigterm
		? `"${sentinelPath}" "${readyPath}" ${redirect} &`
		: `sleep 60 ${redirect} &`;

	// Waiting for the trap to be installed is what makes the escalation test
	// deterministic. The reap fires within ~30ms of this script exiting, which
	// readily beats `trap` being installed in a freshly forked shell — and a
	// descendant signalled before its trap exists dies to SIGTERM by default
	// disposition, silently turning the escalation test into a coin flip.
	const awaitReady = options.ignoreSigterm
		? `for _ in $(seq 1 400); do
  [ -f "${readyPath}" ] && break
  sleep 0.01
done
if [ ! -f "${readyPath}" ]; then
  echo "sentinel never signalled readiness" >&2
  exit 70
fi`
		: "";

	await writeFile(
		path,
		`#!/usr/bin/env bash
set -uo pipefail
summary_path=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) summary_path="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s\\n' "$$" > "${join(binDir, "..", "backend.pid")}"
${descendant}
printf '%s\\n' "$!" > "${pidPath}"
${awaitReady}
printf 'backend-stdout\\n'
# The codex backend returns the summary file in preference to stdout, so the
# marker has to appear in both for one assertion to cover both backends.
if [ -n "$summary_path" ]; then
  printf 'backend-stdout\\n\`\`\`json\\n{"outcome":"success","files":[],"verification":[]}\\n\`\`\`\\n' > "$summary_path"
fi
exit 0
`,
		"utf-8",
	);
	await chmod(path, 0o755);
	return path;
}

async function writeHarness(
	dir: string,
	backendModule: "codex" | "claude-cli",
): Promise<string> {
	const factory =
		backendModule === "codex" ? "createCodexBackend" : "createClaudeCliBackend";
	const path = join(dir, "harness.ts");
	await writeFile(
		path,
		`import { ${factory} } from ${JSON.stringify(
			join(repoRoot, "lib", "driver", "backends", `${backendModule}.ts`),
		)};

const workdir = process.env.HARNESS_WORKDIR;
const binary = process.env.HARNESS_BINARY;
if (!workdir || !binary) throw new Error("harness misconfigured");

const backend = ${factory}(
	${backendModule === "codex" ? "{ binary, globalArgs: [], extraArgs: [] }" : "{ binary, args: [] }"},
);

const start = Date.now();
const result = await backend.run({
	runId: "run-reaping",
	promptPath: workdir + "/prompt.md",
	workdir,
	projectRoot: workdir,
	taskId: "TASK-001",
	parentSessionId: "test-parent",
	planSlug: "drive-process-reaping",
	eventSink: async () => {},
});
const settledMs = Date.now() - start;

const pidText = await Bun.file(workdir + "/descendant.pid").text();
const descendantPid = Number(pidText.trim());
let descendantAliveAtSettle = true;
try {
	process.kill(descendantPid, 0);
} catch {
	descendantAliveAtSettle = false;
}

console.log(
	"HARNESS_RESULT " +
		JSON.stringify({
			exitCode: result.exitCode,
			stdout: result.stdout,
			settledMs,
			descendantPid,
			descendantAliveAtSettle,
		}),
);
`,
		"utf-8",
	);
	return path;
}

/**
 * Runs the harness under a hard deadline. A backend that never settles is the
 * pipe-holding defect, so "did not settle" has to be an observable outcome
 * rather than a suite timeout.
 */
async function runHarness(options: {
	backendModule: "codex" | "claude-cli";
	holdsPipes: boolean;
	ignoreSigterm?: boolean;
	deadlineMs?: number;
}): Promise<HarnessOutcome> {
	const workdir = join(temp.path, `wd-${Math.random().toString(36).slice(2)}`);
	const binDir = join(workdir, "bin");
	await mkdir(binDir, { recursive: true });
	await writeFile(join(workdir, "prompt.md"), "do the thing\n", "utf-8");

	const binary = await writeLeakyBackend(binDir, {
		holdsPipes: options.holdsPipes,
		...(options.ignoreSigterm === undefined
			? {}
			: { ignoreSigterm: options.ignoreSigterm }),
	});
	const harness = await writeHarness(workdir, options.backendModule);

	const child = execFile(
		"bun",
		[harness],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				HARNESS_WORKDIR: workdir,
				HARNESS_BINARY: binary,
			},
			maxBuffer: 1024 * 1024,
		},
		() => undefined,
	);

	let stdout = "";
	child.stdout?.on("data", (chunk) => {
		stdout += String(chunk);
	});

	const deadlineMs = options.deadlineMs ?? 12_000;
	const exited = await new Promise<boolean>((settle) => {
		const timer = setTimeout(() => settle(false), deadlineMs);
		child.once("exit", () => {
			clearTimeout(timer);
			settle(true);
		});
	});

	const recordedPid = await readPidFile(workdir, "descendant.pid");
	if (recordedPid !== undefined) spawnedDescendants.add(recordedPid);
	// The backend child leads its own group. Killing the harness reaches neither
	// it nor its descendants, so a timing-out test would otherwise strand exactly
	// the processes this suite exists to catch.
	const backendPid = await readPidFile(workdir, "backend.pid");
	if (backendPid !== undefined) spawnedBackendGroups.add(backendPid);

	if (!exited) {
		child.kill("SIGKILL");
		return { settled: false, descendantPid: recordedPid };
	}

	const marker = stdout.indexOf("HARNESS_RESULT ");
	expect(
		marker,
		`harness produced no result: ${stdout}`,
	).toBeGreaterThanOrEqual(0);
	const observation = JSON.parse(
		stdout.slice(marker + "HARNESS_RESULT ".length).trim(),
	) as HarnessObservation;
	spawnedDescendants.add(observation.descendantPid);
	return { settled: true, observation };
}

async function readPidFile(
	workdir: string,
	name: string,
): Promise<number | undefined> {
	try {
		const raw = await readFile(join(workdir, name), "utf-8");
		const pid = Number(raw.trim());
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
}

// Each test compiles nothing but does spawn a real `bun` process plus a real
// backend child and descendant, so it pays genuine startup cost under parallel
// suite load. The 15s global is a floor, not a budget for this.
describe("backend process reaping", { timeout: 30_000 }, () => {
	// @cosmo-behavior plan:drive-process-reaping#B-001
	test.each([
		"codex",
		"claude-cli",
	] as const)("leaves no live descendant when the backend settles (%s)", async (backendModule) => {
		const outcome = await runHarness({ backendModule, holdsPipes: false });

		expect(outcome.settled).toBe(true);
		if (!outcome.settled) return;
		const { observation } = outcome;

		expect(
			observation.descendantAliveAtSettle,
			`descendant ${observation.descendantPid} was still alive when ${backendModule}.run() settled`,
		).toBe(false);
		expect(observation.exitCode).toBe(0);
	});

	// @cosmo-behavior plan:drive-process-reaping#B-002
	test.each([
		"codex",
		"claude-cli",
	] as const)("settles when a descendant holds the output pipes open (%s)", async (backendModule) => {
		const outcome = await runHarness({ backendModule, holdsPipes: true });

		expect(
			outcome.settled,
			`${backendModule}.run() never settled: a descendant holding stdout/stderr blocked the drain`,
		).toBe(true);
		if (!outcome.settled) return;

		expect(outcome.observation.exitCode).toBe(0);
		expect(outcome.observation.stdout).toContain("backend-stdout");
	});

	// @cosmo-behavior plan:drive-process-reaping#B-003
	test("escalates an ignored SIGTERM to SIGKILL on a bounded deadline", async () => {
		const outcome = await runHarness({
			backendModule: "codex",
			holdsPipes: false,
			ignoreSigterm: true,
		});

		expect(outcome.settled).toBe(true);
		if (!outcome.settled) return;
		const { observation } = outcome;

		expect(
			observation.descendantAliveAtSettle,
			`SIGTERM-ignoring descendant ${observation.descendantPid} survived the reap`,
		).toBe(false);
		// Both bounds asserted directly rather than inferred from the reaper's
		// defaults. The lower bound is what proves escalation actually happened:
		// the tree could only have died to SIGKILL, so the call must have waited
		// out the SIGTERM grace first. Without it, a reaper that skipped straight
		// to SIGKILL — or one whose grace silently collapsed to zero — would pass.
		expect(observation.settledMs).toBeGreaterThanOrEqual(1_800);
		expect(observation.settledMs).toBeLessThan(10_000);
	});

	// @cosmo-behavior plan:drive-process-reaping#B-005
	test("reports a tree it could not reap", async () => {
		// SIGKILL cannot be ignored, so a group that outlives the kill deadline is
		// not constructible on a healthy host. The reachable equivalent is a group
		// this process is not permitted to signal, which reaches the same
		// `survived` branch and the same reporting path.
		const workdir = join(temp.path, "survived");
		await mkdir(workdir, { recursive: true });
		await writeFile(join(workdir, "prompt.md"), "do the thing\n", "utf-8");

		const childPid = 987_654;
		vi.spyOn(process, "kill").mockImplementation(((
			pid: number,
			signal?: string | number,
		) => {
			if (pid !== -childPid) return true;
			// The group is alive, but signalling it is refused.
			if (signal === 0) return true;
			throw Object.assign(new Error("operation not permitted"), {
				code: "EPERM",
			});
		}) as typeof process.kill);

		vi.stubGlobal("Bun", {
			file: (path: string) => ({ path }),
			spawn: () => ({
				exited: Promise.resolve(0),
				stdout: "backend-stdout\n",
				stderr: "",
				pid: childPid,
			}),
		});

		const events: DriverEvent[] = [];
		const result = await createCodexBackend({
			binary: "unused",
			globalArgs: [],
			extraArgs: [],
		}).run({
			runId: "run-survived",
			promptPath: join(workdir, "prompt.md"),
			workdir,
			projectRoot: workdir,
			taskId: "TASK-001",
			parentSessionId: "test-parent",
			planSlug: "drive-process-reaping",
			eventSink: async (event) => {
				events.push(event);
			},
		});

		const diagnostics = events.filter(
			(event) => event.type === "driver_diagnostic",
		);
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			type: "driver_diagnostic",
			level: "warning",
			code: "BACKEND_PROCESS_TREE_SURVIVED",
			taskId: "TASK-001",
			runId: "run-survived",
		});
		// The backend's own exit code stays authoritative — the diagnostic reports
		// the leak rather than rewriting the task's result.
		expect(result.exitCode).toBe(0);
	});
});
