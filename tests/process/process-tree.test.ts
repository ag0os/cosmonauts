/**
 * Tests for reapProcessTree beyond what runChild's real-process tests reach:
 * a process that outlives SIGKILL (simulated, since no real one can), and
 * the parsing of a `ps` listing.
 */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	listProcesses,
	PROCESS_LISTING_TIMEOUT_MS,
	type ProcessEntry,
	parseProcessListing,
	reapProcessTree,
} from "../../lib/process/process-tree.ts";
import { useTempDir } from "../helpers/fs.ts";

afterEach(() => {
	vi.restoreAllMocks();
});

/** Pids far above any real one, so nothing real is ever signalled. */
const CHILD = 9_000_001;
const TOOL_SHELL = 9_000_002;

function entry(fields: Partial<ProcessEntry> & { pid: number }): ProcessEntry {
	return { ppid: 1, pgid: fields.pid, stat: "S", command: "sleep", ...fields };
}

/**
 * Stands in for `process.kill`: `immortal` pids never die, every other fake
 * pid dies on its first real signal, and the calls are recorded.
 */
function fakeKill(immortal: ReadonlySet<number>) {
	const dead = new Set<number>();
	const sent: string[] = [];
	const members = new Map([
		[CHILD, [CHILD]],
		[TOOL_SHELL, [TOOL_SHELL]],
	]);
	vi.spyOn(process, "kill").mockImplementation(((
		target: number,
		signal?: string | number,
	) => {
		const pids = target < 0 ? (members.get(-target) ?? []) : [target];
		const living = pids.filter((pid) => !dead.has(pid));
		if (living.length === 0) {
			const error = new Error("ESRCH") as Error & { code: string };
			error.code = "ESRCH";
			throw error;
		}
		if (signal === 0) return true;
		sent.push(`${String(signal)} ${target}`);
		for (const pid of living) if (!immortal.has(pid)) dead.add(pid);
		return true;
	}) as typeof process.kill);
	return { sent };
}

describe("reapProcessTree", () => {
	const listing = [
		entry({ pid: CHILD, command: "claude -p" }),
		entry({
			pid: TOOL_SHELL,
			ppid: CHILD,
			command: "/bin/zsh -c python3 -c sleep",
		}),
	];

	test("signals the group a descendant leads, not only the child's", async () => {
		const { sent } = fakeKill(new Set());

		const reaped = await reapProcessTree(CHILD, {
			graceMs: 50,
			killWaitMs: 50,
			list: async () => listing,
		});

		expect(reaped).toEqual({ kind: "gone", by: "SIGTERM" });
		expect(sent).toEqual([`SIGTERM -${CHILD}`, `SIGTERM -${TOOL_SHELL}`]);
	});

	test("reports the pids it finds in the tree before signalling them", async () => {
		const { sent } = fakeKill(new Set());
		const found: { pids: number[]; signalsSent: number }[] = [];

		await reapProcessTree(CHILD, {
			graceMs: 50,
			killWaitMs: 50,
			list: async () => [
				...listing,
				entry({ pid: 9_000_003, ppid: 1, command: "unrelated" }),
			],
			onFound: (pids) =>
				found.push({
					pids: [...pids].sort((a, b) => a - b),
					signalsSent: sent.length,
				}),
		});

		expect(found[0]).toEqual({ pids: [CHILD, TOOL_SHELL], signalsSent: 0 });
	});

	test("reports what outlived SIGKILL, never gone", async () => {
		const { sent } = fakeKill(new Set([TOOL_SHELL]));

		const reaped = await reapProcessTree(CHILD, {
			graceMs: 0,
			killWaitMs: 50,
			list: async () => listing,
		});

		expect(sent).toContain(`SIGKILL -${TOOL_SHELL}`);
		expect(reaped).toEqual({
			kind: "survived",
			reason: `still running after SIGTERM and SIGKILL: ${TOOL_SHELL} (/bin/zsh -c python3 -c sleep)`,
		});
	});

	test("does not count a zombie as a survivor", async () => {
		fakeKill(new Set([TOOL_SHELL]));
		let listings = 0;

		const reaped = await reapProcessTree(CHILD, {
			graceMs: 0,
			killWaitMs: 50,
			list: async () => {
				listings += 1;
				if (listings < 3) return listing;
				return listing.map((process) => ({ ...process, stat: "Z" }));
			},
		});

		expect(reaped).toEqual({ kind: "gone", by: "SIGKILL" });
	});

	test("goes on to SIGKILL the rest when one member cannot be signalled", async () => {
		const ROOT_OWNED = 9_000_003;
		const sent: string[] = [];
		const dead = new Set<number>();
		vi.spyOn(process, "kill").mockImplementation(((
			target: number,
			signal?: string | number,
		) => {
			const pid = Math.abs(target);
			if (pid === ROOT_OWNED) {
				const error = new Error("kill EPERM") as Error & { code: string };
				error.code = "EPERM";
				throw error;
			}
			if (dead.has(pid)) {
				const error = new Error("kill ESRCH") as Error & { code: string };
				error.code = "ESRCH";
				throw error;
			}
			if (signal === 0) return true;
			sent.push(`${String(signal)} ${target}`);
			if (signal === "SIGKILL") dead.add(pid);
			return true;
		}) as typeof process.kill);
		const withRootOwned = [
			listing[0] as ProcessEntry,
			entry({ pid: ROOT_OWNED, ppid: CHILD, command: "sudo true" }),
			listing[1] as ProcessEntry,
		];

		const reaped = await reapProcessTree(CHILD, {
			graceMs: 0,
			killWaitMs: 50,
			list: async () => withRootOwned,
		});

		expect(sent).toEqual([
			`SIGTERM -${CHILD}`,
			`SIGTERM -${TOOL_SHELL}`,
			`SIGKILL -${CHILD}`,
			`SIGKILL -${TOOL_SHELL}`,
		]);
		expect(reaped).toEqual({
			kind: "survived",
			reason: [
				`failed to send SIGTERM to process group ${ROOT_OWNED}: kill EPERM`,
				`failed to send SIGKILL to process group ${ROOT_OWNED}: kill EPERM`,
				`still running after SIGTERM and SIGKILL: ${ROOT_OWNED} (sudo true)`,
			].join("; "),
		});
	});

	test("finds nothing to reap once the tree has exited", async () => {
		const { sent } = fakeKill(new Set());

		const reaped = await reapProcessTree(CHILD + 10, {
			graceMs: 50,
			killWaitMs: 50,
			list: async () => [],
		});

		expect(reaped).toEqual({ kind: "gone", by: "exit" });
		expect(sent).toEqual([]);
	});
});

describe("parseProcessListing", () => {
	test("reads pid, ppid, pgid, state and the whole command", () => {
		expect(
			parseProcessListing(
				"  101     1   101 Ss   /bin/zsh -c sleep 60\n 202   101   101 Z+   \n\n",
			),
		).toEqual([
			{
				pid: 101,
				ppid: 1,
				pgid: 101,
				stat: "Ss",
				command: "/bin/zsh -c sleep 60",
			},
			{ pid: 202, ppid: 101, pgid: 101, stat: "Z+", command: "" },
		]);
	});
});

describe("listProcesses", () => {
	const bin = useTempDir("process-tree-ps-");
	const path = process.env.PATH;

	afterEach(() => {
		process.env.PATH = path;
	});

	async function fakePs(script: string): Promise<void> {
		const file = join(bin.path, "ps");
		await writeFile(file, `#!/bin/sh\n${script}\n`);
		await chmod(file, 0o755);
		process.env.PATH = `${bin.path}:${path ?? ""}`;
	}

	test("kills a ps that ignores SIGTERM at the time bound and reports an error", async () => {
		await fakePs("trap '' TERM\nexec sleep 3");
		const started = Date.now();

		const listed = await listProcesses();

		expect(listed).toBeInstanceOf(Error);
		expect(Date.now() - started).toBeLessThan(
			PROCESS_LISTING_TIMEOUT_MS + 1_000,
		);
	});

	test("treats a listing without this process as an error", async () => {
		await fakePs("echo '    1     0     1 Ss   /sbin/launchd'");

		const listed = await listProcesses();

		expect(listed).toBeInstanceOf(Error);
		expect((listed as Error).message).toContain(String(process.pid));
	});
});
