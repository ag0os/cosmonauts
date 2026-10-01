/**
 * Tests for the process owner: what runChild records for the owner of its
 * caller's async context, with real processes on this platform.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
	ownProcesses,
	ProcessOwner,
} from "../../lib/process/owned-processes.ts";
import { listProcesses } from "../../lib/process/process-tree.ts";
import { type RunChildOptions, runChild } from "../../lib/process/run-child.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("owned-processes-");
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

function sh(script: string, extra: Partial<RunChildOptions> = {}) {
	return runChild({
		command: "sh",
		args: ["-c", script],
		cwd: tmp.path,
		output: {
			stdout: join(tmp.path, "child.stdout.log"),
			stderr: join(tmp.path, "child.stderr.log"),
		},
		...extra,
	});
}

async function waitForMatch(pattern: RegExp): Promise<RegExpExecArray> {
	const path = join(tmp.path, "child.stdout.log");
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const text = await readFile(path, "utf8").catch(() => "");
		const match = pattern.exec(text);
		if (match) return match;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`no ${String(pattern)} in ${path}`);
}

describe("ProcessOwner with runChild", () => {
	test.skipIf(process.platform === "win32")(
		"owns the child and the descendants a listing found until the runner sees them gone",
		async () => {
			const owner = new ProcessOwner();
			const controller = new AbortController();
			const seen: number[][] = [];
			const run = ownProcesses(owner, () =>
				sh('trap "" TERM; sleep 30 & echo "$$ $!"; wait', {
					signal: controller.signal,
					graceMs: 200,
					listProcesses: () => {
						seen.push(owner.current());
						return listProcesses();
					},
				}),
			);
			const match = await waitForMatch(/^(\d+) (\d+)\n/u);
			const shell = Number(match[1]);
			const sleep = Number(match[2]);
			leftovers.push(shell, sleep);
			expect(owner.current()).toEqual([shell]);

			controller.abort();
			const outcome = await run;

			expect(outcome.tree).toEqual({ kind: "gone", by: "SIGKILL" });
			expect(seen[0]).toEqual([shell]);
			expect(seen[1]).toEqual([shell, sleep].sort((a, b) => a - b));
			expect(owner.close()).toEqual([]);
		},
	);

	test("keeps a child whose tree the runner could not confirm gone", async () => {
		const owner = new ProcessOwner();

		const outcome = await ownProcesses(owner, () =>
			sh("exit 0", {
				platform: "win32",
				taskkill: async () => {
					throw new Error("not called");
				},
			}),
		);

		expect(outcome.tree.kind).toBe("unverified");
		const owned = owner.close();
		expect(owned).toHaveLength(1);
		expect(owned[0]).not.toBe(process.pid);
	});

	test("records a tree it could not enumerate with the owner's label at the claim", async () => {
		let label = "builder-1";
		const owner = new ProcessOwner({ label: () => label });

		await ownProcesses(owner, () =>
			sh("exit 0", {
				platform: "win32",
				taskkill: async () => {
					throw new Error("not called");
				},
			}),
		);
		label = "reviewer";

		const [pid] = owner.current();
		expect(owner.unverified()).toEqual([
			{
				pid,
				reason: `process ${pid} exited; Windows cannot enumerate its descendants`,
				label: "builder-1",
			},
		]);
	});

	test.skipIf(process.platform === "win32")(
		"records no unverified tree for a child confirmed gone",
		async () => {
			const owner = new ProcessOwner({ label: () => "builder-1" });

			await ownProcesses(owner, () => sh("exit 0"));

			expect(owner.unverified()).toEqual([]);
		},
	);

	test("starts nothing once the owner is closed", async () => {
		const owner = new ProcessOwner();
		owner.close();
		const marker = join(tmp.path, "started");

		const outcome = await ownProcesses(owner, () => sh(`touch "${marker}"`));

		expect(outcome.exit.kind).toBe("spawn-error");
		expect(
			outcome.exit.kind === "spawn-error" && outcome.exit.error.message,
		).toBe("not started: the run that owns this process has ended");
		expect(existsSync(marker)).toBe(false);
		expect(owner.current()).toEqual([]);
	});

	test("outside any owner, records nothing", async () => {
		const owner = new ProcessOwner();

		await sh("exit 0");

		expect(owner.close()).toEqual([]);
	});
});
