/**
 * Tests for the end-of-run process checks: which owned pids still run, the
 * bounded wait for them, and the detached candidates found by command line.
 */
import { execFileSync, spawn } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import {
	confirmGone,
	detachedCandidates,
	runningPids,
} from "../../lib/lean-run/cleanup-check.ts";
import type {
	ListProcesses,
	ProcessEntry,
} from "../../lib/process/process-tree.ts";

const leftovers: number[] = [];

afterEach(() => {
	for (const pid of leftovers.splice(0)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Already gone.
		}
	}
});

/** The pid of a process that has already exited. */
function deadPid(): number {
	return Number(
		execFileSync("node", ["-p", "process.pid"], { encoding: "utf8" }),
	);
}

function sleeper(): number {
	const child = spawn("sleep", ["30"], { stdio: "ignore" });
	const pid = child.pid ?? 0;
	leftovers.push(pid);
	return pid;
}

function entry(fields: Partial<ProcessEntry> & { pid: number }): ProcessEntry {
	return { ppid: 1, pgid: fields.pid, stat: "S", command: "sleep", ...fields };
}

function countingList(entries: readonly ProcessEntry[] | Error): {
	list: ListProcesses;
	calls: () => number;
} {
	let calls = 0;
	return {
		list: async () => {
			calls += 1;
			return entries;
		},
		calls: () => calls,
	};
}

describe("runningPids", () => {
	test("finds a gone pid gone without listing", async () => {
		const { list, calls } = countingList(new Error("not called"));

		const check = await runningPids([deadPid()], { list });

		expect(check.running).toEqual([]);
		expect(calls()).toBe(0);
	});

	test("counts a pid the listing shows as a zombie as gone", async () => {
		const pid = sleeper();
		const { list } = countingList([entry({ pid, stat: "Z" })]);

		const check = await runningPids([pid], { list });

		expect(check.running).toEqual([]);
	});

	test("keeps a live pid running when the listing fails", async () => {
		const pid = sleeper();
		const { list } = countingList(new Error("ps failed"));

		const check = await runningPids([pid], { list });

		expect(check.running).toEqual([pid]);
	});

	test("on Windows, decides by signal 0 alone and keeps a live pid running", async () => {
		const pid = sleeper();
		const { list, calls } = countingList([]);

		const check = await runningPids([pid], { list, platform: "win32" });

		expect(check.running).toEqual([pid]);
		expect(calls()).toBe(0);
	});
});

describe("confirmGone", () => {
	test("does not wait when every pid is already gone", async () => {
		const { list, calls } = countingList(new Error("not called"));
		const started = Date.now();

		const check = await confirmGone([deadPid(), deadPid()], {
			list,
			boundMs: 30_000,
		});

		expect(check.running).toEqual([]);
		expect(calls()).toBe(0);
		expect(Date.now() - started).toBeLessThan(1_000);
	});

	test("waits for a pid that exits within the bound", async () => {
		const child = spawn("sleep", ["0.3"], { stdio: "ignore" });
		const pid = child.pid ?? 0;
		leftovers.push(pid);
		const live: ListProcesses = async () =>
			child.exitCode === null && child.signalCode === null
				? [entry({ pid })]
				: [];

		const check = await confirmGone([pid], { list: live, boundMs: 5_000 });

		expect(check.running).toEqual([]);
	});

	test("reports a pid still running when the bound passes", async () => {
		const pid = sleeper();
		const started = Date.now();

		const check = await confirmGone([pid], {
			list: async () => [entry({ pid })],
			boundMs: 200,
		});

		expect(check.running).toEqual([pid]);
		expect(Date.now() - started).toBeGreaterThanOrEqual(200);
	});

	test("checks pids added while it waits when given a function", async () => {
		const first = sleeper();
		const late = sleeper();
		let reads = 0;
		const pids = () => {
			reads += 1;
			return reads === 1 ? [first] : [first, late];
		};

		const check = await confirmGone(pids, {
			list: async () => [entry({ pid: first }), entry({ pid: late })],
			boundMs: 250,
		});

		expect(check.running).toEqual([first, late].sort((a, b) => a - b));
	});
});

describe("detachedCandidates", () => {
	test("lists running processes that name the clone, other than owned ones, this one and zombies", () => {
		const clone = "/tmp/cosmonauts-lean-builder-x/checkout";
		const listing = [
			entry({
				pid: 9_000_001,
				command: `node ${clone}/node_modules/.bin/vitest`,
			}),
			entry({ pid: 9_000_002, command: "node unrelated.js" }),
			entry({ pid: 9_000_003, command: `sleep ${clone}` }),
			entry({ pid: 9_000_004, command: `sh ${clone}/x`, stat: "Z" }),
			entry({ pid: process.pid, command: `node ${clone}` }),
			entry({ pid: 9_000_005, command: `cat /private${clone}/y` }),
		];

		const candidates = detachedCandidates(listing, {
			paths: [clone, `/private${clone}`],
			owned: [9_000_003],
		});

		expect(candidates).toEqual([
			{ pid: 9_000_001, command: `node ${clone}/node_modules/.bin/vitest` },
			{ pid: 9_000_005, command: `cat /private${clone}/y` },
		]);
	});

	test("shortens a long command line", () => {
		const clone = "/tmp/clone";
		const command = `node ${clone} ${"x".repeat(500)}`;

		const [candidate] = detachedCandidates(
			[entry({ pid: 9_000_001, command })],
			{
				paths: [clone],
				owned: [],
			},
		);

		expect(candidate?.command).toHaveLength(200);
		expect(candidate?.command.endsWith("...")).toBe(true);
	});

	test("keeps the longest spelling it matched", () => {
		const clone = `/var/cosmonauts-lean-builder-x/${"c".repeat(40)}/checkout`;
		const command = `node ${"a".repeat(180)} /private${clone}/marker`;

		const [candidate] = detachedCandidates(
			[entry({ pid: 9_000_001, command })],
			{ paths: [clone, `/private${clone}`], owned: [] },
		);

		expect(candidate?.command).toContain(`/private${clone}`);
	});

	test("keeps the matched path when the cut would fall inside it", () => {
		const clone = `/tmp/cosmonauts-lean-builder-x/${"c".repeat(40)}/checkout`;
		const command = `node ${"a".repeat(180)} ${clone}/marker ${"z".repeat(100)}`;

		const [candidate] = detachedCandidates(
			[entry({ pid: 9_000_001, command })],
			{ paths: [clone], owned: [] },
		);

		expect(candidate?.command).toHaveLength(200);
		expect(candidate?.command).toContain(clone);
		expect(candidate?.command.startsWith("node aaa")).toBe(true);
		expect(candidate?.command.endsWith(`...${clone}...`)).toBe(true);
	});
});
