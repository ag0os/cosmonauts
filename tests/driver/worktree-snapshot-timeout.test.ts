import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const observed = vi.hoisted(() => ({
	commands: [] as string[],
	failAdd: false,
	failPreflight: false,
	failCleanup: false,
}));
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		execFileSync: ((
			command: string,
			args: string[],
			options: { timeout?: number },
		) => {
			observed.commands.push(`${command} ${args.join(" ")}`);
			if (command === "git" && !options.timeout)
				throw new Error(`unbounded git ${args.join(" ")}`);
			if (observed.failAdd && args.includes("add"))
				throw new Error("git add timed out");
			if (observed.failPreflight && args.includes("--is-inside-work-tree"))
				throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
			if (observed.failCleanup && args.includes("-d"))
				throw new Error("timed out");
			return actual.execFileSync(command, args, options);
		}) as typeof actual.execFileSync,
	};
});

import {
	removeDoneTaskSnapshots,
	snapshotWorktree,
} from "../../lib/driver/runtime-helpers.ts";

let root: string;
afterEach(async () => {
	observed.commands = [];
	observed.failAdd = false;
	observed.failPreflight = false;
	observed.failCleanup = false;
	if (root) await rm(root, { recursive: true, force: true });
});
test("bounds snapshot and cleanup git commands and identifies a stalled add", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-timeout-"));
	const { execFileSync } =
		await vi.importActual<typeof import("node:child_process")>(
			"node:child_process",
		);
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8" });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	await writeFile(join(root, "tracked"), "changed");
	observed.failPreflight = true;
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
		}),
	).rejects.toThrow(/git rev-parse --is-inside-work-tree failed.*timed out/);
	observed.failPreflight = false;
	observed.failAdd = true;
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
		}),
	).rejects.toThrow(/git .*add.*failed.*timed out/);
	observed.failAdd = false;
	const ref = await snapshotWorktree({
		projectRoot: root,
		runId: "run-1",
		taskId: "TASK-1",
		attemptNumber: 1,
	});
	expect(ref).toBeDefined();
	observed.failCleanup = true;
	expect(() => removeDoneTaskSnapshots(root, "run-1", "TASK-1")).toThrow(
		/git update-ref -d .* failed.*timed out/,
	);
	observed.failCleanup = false;
	removeDoneTaskSnapshots(root, "run-1", "TASK-1");
	expect(
		observed.commands.some((command) => command.includes("update-ref -d")),
	).toBe(true);
});
