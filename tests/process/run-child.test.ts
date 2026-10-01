/**
 * Tests for runChild: real child and grandchild processes on this platform,
 * and the Windows escalation through an injected taskkill.
 */
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	type ChildRunOutcome,
	type RunChildOptions,
	readSpool,
	runChild,
} from "../../lib/process/run-child.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("run-child-");
const leftovers: number[] = [];

afterEach(() => {
	for (const pid of leftovers.splice(0)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Already gone, which is what the tests expect.
		}
	}
});

function output(name = "child"): RunChildOptions["output"] {
	return {
		stdout: join(tmp.path, `${name}.stdout.log`),
		stderr: join(tmp.path, `${name}.stderr.log`),
	};
}

function sh(script: string, extra: Partial<RunChildOptions> = {}) {
	return runChild({
		command: "sh",
		args: ["-c", script],
		cwd: tmp.path,
		output: output(),
		...extra,
	});
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

/** Members of process group `pgid`, by `ps`. */
function groupMembers(pgid: number): number[] {
	const listing = execFileSync("ps", ["-A", "-o", "pid=,pgid="], {
		encoding: "utf8",
	});
	return listing
		.split("\n")
		.map((line) => line.trim().split(/\s+/u).map(Number))
		.filter(([, group]) => group === pgid)
		.map(([pid]) => pid ?? 0);
}

/** `sh` prints `<its pid> <grandchild pid>` first; waits for that line in the spool. */
async function readPids(
	path: string,
): Promise<{ shell: number; sleep: number }> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const text = await readFile(path, "utf8").catch(() => "");
		const match = /^(\d+) (\d+)\n/u.exec(text);
		if (match) {
			const pids = { shell: Number(match[1]), sleep: Number(match[2]) };
			leftovers.push(pids.shell, pids.sleep);
			return pids;
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`no pids in ${path}`);
}

const SLEEPER = "sleep 60 & echo $$ $!; wait";
const TERM_IGNORING_SLEEPER = `trap "" TERM; ${SLEEPER}`;

describe("runChild stopping a process tree on POSIX", () => {
	test("an abort resolves only after the grandchild is gone", async () => {
		const controller = new AbortController();
		const run = sh(SLEEPER, { signal: controller.signal });
		const pids = await readPids(output().stdout);
		expect(alive(pids.sleep)).toBe(true);

		const abortedAt = Date.now();
		controller.abort(new Error("stop"));
		const outcome = await run;
		const latencyMs = Date.now() - abortedAt;

		expect(alive(pids.sleep)).toBe(false);
		expect(groupMembers(pids.shell)).toEqual([]);
		expect(outcome.stopped).toEqual({
			kind: "aborted",
			reason: new Error("stop"),
		});
		expect(outcome.tree).toEqual({ kind: "gone", by: "SIGTERM" });
		expect(latencyMs).toBeLessThan(2_000);
	});

	test("the timeout resolves only after the grandchild is gone", async () => {
		const run = sh(SLEEPER, { timeoutMs: 300 });
		const pids = await readPids(output().stdout);

		const outcome = await run;

		expect(alive(pids.sleep)).toBe(false);
		expect(groupMembers(pids.shell)).toEqual([]);
		expect(outcome.stopped).toEqual({ kind: "timeout", timeoutMs: 300 });
		expect(outcome.tree).toEqual({ kind: "gone", by: "SIGTERM" });
	});

	test("kills a tree that ignores SIGTERM once the grace period ends", async () => {
		const started = Date.now();
		const run = sh(TERM_IGNORING_SLEEPER, { timeoutMs: 200, graceMs: 400 });
		const pids = await readPids(output().stdout);

		const outcome = await run;

		expect(alive(pids.sleep)).toBe(false);
		expect(alive(pids.shell)).toBe(false);
		expect(outcome.tree).toEqual({ kind: "gone", by: "SIGKILL" });
		expect(outcome.exit).toEqual({ kind: "signal", signal: "SIGKILL" });
		expect(Date.now() - started).toBeGreaterThanOrEqual(600);
	});

	test("reaps what a child left running when it exits on its own", async () => {
		const outcome = await sh("sleep 60 & echo $$ $!; exit 0");
		const text = await readSpool(outcome.stdout);
		const [, sleep] = text.trim().split(" ").map(Number);
		leftovers.push(sleep ?? 0);

		expect(outcome.exit).toEqual({ kind: "code", code: 0 });
		expect(outcome.stopped).toBeUndefined();
		expect(outcome.tree).toEqual({ kind: "gone", by: "SIGTERM" });
		expect(alive(sleep ?? 0)).toBe(false);
	});

	test("does not spawn when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort("early");
		const outcome = await sh("echo ran", { signal: controller.signal });

		expect(outcome.exit).toEqual({ kind: "not-started" });
		expect(outcome.stopped).toEqual({ kind: "aborted", reason: "early" });
		expect(outcome.stdout.bytes).toBe(0);
	});
});

describe("runChild on Windows", () => {
	/** A real POSIX child stands in; the injected taskkill records calls and kills on /F. */
	async function windowsRun(gracefulExit: number): Promise<{
		events: string[];
		outcome: ChildRunOutcome;
	}> {
		const events: string[] = [];
		const controller = new AbortController();
		const run = runChild({
			command: "sleep",
			args: ["60"],
			cwd: tmp.path,
			output: output(),
			signal: controller.signal,
			platform: "win32",
			graceMs: 200,
			killWaitMs: 1_000,
			taskkill: async (args) => {
				events.push(`taskkill ${args.slice(2).join(" ")}`);
				const pid = Number(args[1]);
				if (!args.includes("/F")) return gracefulExit;
				process.kill(pid, "SIGKILL");
				return 0;
			},
		});
		setTimeout(() => controller.abort("stop"), 100);
		const outcome = await run;
		events.push("resolved");
		return { events, outcome };
	}

	test("escalates taskkill /T to /T /F and resolves after the forced kill", async () => {
		const { events, outcome } = await windowsRun(1);

		expect(events).toEqual(["taskkill /T", "taskkill /T /F", "resolved"]);
		expect(outcome.tree).toEqual({ kind: "gone", by: "taskkill /F" });
		expect(outcome.exit).toEqual({ kind: "signal", signal: "SIGKILL" });
		expect(outcome.notes).toEqual([
			expect.stringMatching(/^taskkill \/PID \d+ \/T exited 1$/u),
		]);
	});

	test("passes the child's pid to taskkill", async () => {
		const calls: string[][] = [];
		const controller = new AbortController();
		const run = runChild({
			command: "sleep",
			args: ["60"],
			cwd: tmp.path,
			output: output(),
			signal: controller.signal,
			platform: "win32",
			graceMs: 50,
			taskkill: async (args) => {
				calls.push([...args]);
				if (args.includes("/F")) process.kill(Number(args[1]), "SIGKILL");
				return 0;
			},
		});
		setTimeout(() => controller.abort(), 50);
		await run;

		const pid = calls[0]?.[1];
		expect(calls).toEqual([
			["/PID", pid, "/T"],
			["/PID", pid, "/T", "/F"],
		]);
	});

	test("reports the tree as survived when taskkill /T /F fails", async () => {
		const controller = new AbortController();
		let pid = 0;
		const run = runChild({
			command: "sleep",
			args: ["60"],
			cwd: tmp.path,
			output: output(),
			signal: controller.signal,
			platform: "win32",
			graceMs: 50,
			killWaitMs: 100,
			taskkill: async (args) => {
				pid = Number(args[1]);
				return 128;
			},
		});
		setTimeout(() => controller.abort(), 50);
		const outcome = await run;
		leftovers.push(pid);

		expect(outcome.tree.kind).toBe("survived");
	});

	test("leaves the tree unverified when the child exits after a failed taskkill /T", async () => {
		const calls: string[] = [];
		const controller = new AbortController();
		const run = runChild({
			command: "sleep",
			args: ["60"],
			cwd: tmp.path,
			output: output(),
			signal: controller.signal,
			platform: "win32",
			graceMs: 500,
			taskkill: async (args) => {
				calls.push(args.slice(2).join(" "));
				process.kill(Number(args[1]), "SIGKILL");
				return 1;
			},
		});
		setTimeout(() => controller.abort(), 50);
		const outcome = await run;

		expect(calls).toEqual(["/T"]);
		expect(outcome.tree.kind).toBe("unverified");
	});

	test("cannot verify the descendants of a child that exited on its own", async () => {
		const outcome = await runChild({
			command: "sh",
			args: ["-c", "exit 0"],
			cwd: tmp.path,
			output: output(),
			platform: "win32",
			taskkill: async () => {
				throw new Error("not called");
			},
		});

		expect(outcome.tree.kind).toBe("unverified");
	});
});

describe("runChild output", () => {
	test("spools output to files instead of returning it", async () => {
		const outcome = await sh("echo out; echo err >&2");

		expect(await readFile(outcome.stdout.path, "utf8")).toBe("out\n");
		expect(await readFile(outcome.stderr.path, "utf8")).toBe("err\n");
	});

	test("truncates a stream at the byte cap and says so", async () => {
		const outcome = await sh("head -c 100000 /dev/zero | tr '\\0' x", {
			outputCapBytes: 1_000,
		});

		const text = await readSpool(outcome.stdout);
		expect(outcome.exit).toEqual({ kind: "code", code: 0 });
		expect(outcome.stdout).toMatchObject({ bytes: 100_000, truncated: true });
		expect(text.startsWith("x".repeat(1_000))).toBe(true);
		expect(text.slice(1_000)).toContain("output truncated");
		expect((await stat(outcome.stdout.path)).size).toBeLessThan(1_100);
	});

	test("shares one file and one cap when both streams name the same path", async () => {
		const log = join(tmp.path, "both.log");
		const outcome = await sh("echo out; echo err >&2", {
			output: { stdout: log, stderr: log },
		});

		expect((await readSpool(outcome.stdout)).split("\n").sort()).toEqual([
			"",
			"err",
			"out",
		]);
	});

	test("reads only the tail of a spool when asked", async () => {
		const outcome = await sh("printf 'head-tail'");

		expect(await readSpool(outcome.stdout, 4)).toBe("tail");
	});
});

describe("runChild stdin", () => {
	test("writes stdin and closes it, so a child reading to EOF finishes", async () => {
		const outcome = await runChild({
			command: "cat",
			args: [],
			cwd: tmp.path,
			output: output(),
			stdin: "prompt text",
		});

		expect(outcome.exit).toEqual({ kind: "code", code: 0 });
		expect(await readSpool(outcome.stdout)).toBe("prompt text");
	});

	test("a child that exits without reading stdin leaves a note, and its tree is still reaped", async () => {
		const outcome = await runChild({
			command: "sh",
			args: ["-c", "sleep 60 & echo $!; exit 0"],
			cwd: tmp.path,
			output: output(),
			stdin: "x".repeat(1024 * 1024),
		});
		const sleep = Number((await readSpool(outcome.stdout)).trim());
		leftovers.push(sleep);

		expect(outcome.exit).toEqual({ kind: "code", code: 0 });
		expect(outcome.tree.kind).toBe("gone");
		expect(alive(sleep)).toBe(false);
		expect(outcome.notes.some((note) => note.startsWith("stdin: "))).toBe(true);
	});
});

describe("runChild failures", () => {
	test("reports a missing command as a spawn error with nothing left running", async () => {
		const outcome = await runChild({
			command: join(tmp.path, "missing"),
			args: [],
			cwd: tmp.path,
			output: output(),
		});

		expect(outcome.exit.kind).toBe("spawn-error");
		expect(outcome.tree).toEqual({ kind: "gone", by: "exit" });
	});

	test("rejects without spawning when beforeSpawn throws", async () => {
		const marker = join(tmp.path, "spawned");
		await expect(
			sh(`touch ${marker}`, {
				beforeSpawn: () => {
					throw new Error("not authorized");
				},
			}),
		).rejects.toThrow("not authorized");
		await expect(stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
