import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const observed = vi.hoisted(() => ({
	commands: [] as string[],
	abortAdd: undefined as (() => void) | undefined,
	stallCommand: undefined as string | undefined,
}));
vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:child_process")>();
	return {
		...actual,
		spawn: ((
			command: string,
			args: string[],
			options: { timeout?: number; signal?: AbortSignal },
		) => {
			if (command === "git") {
				observed.commands.push(`${command} ${args.join(" ")}`);
				if (!options.timeout || !options.signal)
					throw new Error(`unbounded git ${args.join(" ")}`);
			}
			// G4: emulate a stalled Git child without making this test wait a minute.
			const child =
				command === "git" &&
				observed.stallCommand &&
				args.join(" ").includes(observed.stallCommand)
					? actual.spawn(
							process.execPath,
							["-e", "setTimeout(() => {}, 60000)"],
							{ ...options, timeout: 20 },
						)
					: actual.spawn(command, args, options);
			if (command === "git" && args.includes("add"))
				setImmediate(() => observed.abortAdd?.());
			return child;
		}) as typeof actual.spawn,
	};
});

import {
	removeDoneTaskSnapshots,
	snapshotWorktree,
} from "../../lib/driver/runtime-helpers.ts";

let root: string;
afterEach(async () => {
	observed.commands = [];
	observed.abortAdd = undefined;
	observed.stallCommand = undefined;
	if (root) await rm(root, { recursive: true, force: true });
});
test("aborts an in-flight snapshot add and identifies the git command", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-abort-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	await writeFile(join(root, "tracked"), "changed");
	const controller = new AbortController();
	observed.abortAdd = () => controller.abort();
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
			signal: controller.signal,
		}),
	).rejects.toThrow(/git .*add.*failed: aborted/);
	expect(observed.commands.some((command) => command.includes("add -A"))).toBe(
		true,
	);
});

test("identifies timed-out snapshot and cleanup git commands", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-stall-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	await writeFile(join(root, "tracked"), "changed");
	const signal = new AbortController().signal;
	const options = {
		projectRoot: root,
		runId: "run-1",
		taskId: "TASK-1",
		attemptNumber: 1,
		signal,
	};
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	await expect(snapshotWorktree(options)).rejects.toThrow(
		/git rev-parse --is-inside-work-tree failed: timed out/,
	);
	observed.stallCommand = "add -A";
	await expect(snapshotWorktree(options)).rejects.toThrow(
		/git .*add -A.*failed: timed out/,
	);
	observed.stallCommand = undefined;
	await snapshotWorktree(options);
	observed.stallCommand = "update-ref -d";
	await expect(
		removeDoneTaskSnapshots(
			root,
			"run-1",
			"TASK-1",
			"no-commit",
			undefined,
			signal,
		),
	).rejects.toThrow(/git update-ref -d .*failed: timed out/);
});

test("bounds snapshot and cleanup git commands through an abortable runner", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-timeout-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8" });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	await writeFile(join(root, "tracked"), "changed");
	const signal = new AbortController().signal;
	const ref = await snapshotWorktree({
		projectRoot: root,
		runId: "run-1",
		taskId: "TASK-1",
		attemptNumber: 1,
		signal,
	});
	expect(ref).toBeDefined();
	await writeFile(join(root, "tracked"), "base");
	const retained = await removeDoneTaskSnapshots(
		root,
		"run-1",
		"TASK-1",
		"no-commit",
		undefined,
		signal,
	);
	expect(retained).toEqual([ref]);
	expect(
		observed.commands.some((command) => command.includes("update-ref")),
	).toBe(true);
});
