import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const observed = vi.hoisted(() => ({
	commands: [] as string[],
	abortAdd: undefined as (() => void) | undefined,
	stallCommand: undefined as string | undefined,
	inheritedPipe: false,
	warningBeforeStall: false,
	failCommandWithWarning: false,
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
				if (
					args.join(" ").includes(observed.stallCommand ?? "\u0000") &&
					(!options.timeout || !options.signal)
				)
					throw new Error(`unbounded git ${args.join(" ")}`);
			}
			// G4: emulate a stalled Git child without making this test wait a minute.
			const child =
				command === "git" &&
				observed.failCommandWithWarning &&
				args.join(" ").includes(observed.stallCommand ?? "\u0000")
					? actual.spawn(
							process.execPath,
							["-e", 'process.stderr.write("warning\\n");process.exit(1)'],
							options,
						)
					: command === "git" &&
							observed.stallCommand &&
							args.join(" ").includes(observed.stallCommand)
						? actual.spawn(
								process.execPath,
								[
									"-e",
									observed.inheritedPipe
										? 'require("node:child_process").spawn(process.execPath,["-e","setTimeout(()=>{},2200)"],{stdio:["ignore",1,2]});process.stdout.write("descendant ready\\n");setTimeout(()=>{},60000)'
										: observed.warningBeforeStall
											? 'process.stderr.write("warning\\n");setTimeout(() => {}, 60000)'
											: "setTimeout(() => {}, 60000)",
								],
								{
									...options,
									timeout: observed.inheritedPipe
										? 180
										: observed.warningBeforeStall
											? 250
											: 20,
								},
							)
						: actual.spawn(command, args, options);
			if (command === "git" && args.includes("add")) {
				if (observed.inheritedPipe)
					child.stdout?.once("data", () => observed.abortAdd?.());
				else setImmediate(() => observed.abortAdd?.());
			}
			return child;
		}) as typeof actual.spawn,
	};
});

import { runDriveOnGraph } from "../../lib/driver/drive-graph-runner.ts";
import { runOneTask } from "../../lib/driver/run-one-task.ts";
import {
	removeDoneTaskSnapshots,
	runCommand,
	snapshotWorktree,
} from "../../lib/driver/runtime-helpers.ts";
import type { DriverRunSpec } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

let root: string;
afterEach(async () => {
	observed.commands = [];
	observed.abortAdd = undefined;
	observed.stallCommand = undefined;
	observed.inheritedPipe = false;
	observed.warningBeforeStall = false;
	observed.failCommandWithWarning = false;
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

test("rejects a warning-producing timed-out snapshot preflight", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-warning-"));
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	observed.warningBeforeStall = true;
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
		}),
	).rejects.toThrow(/git rev-parse --is-inside-work-tree failed: timed out/);
});

test("returns no snapshot for a genuine non-worktree", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-non-worktree-"));
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
		}),
	).resolves.toBeUndefined();
});

test("rejects an unexpected git preflight error rather than treating it as non-worktree", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-git-error-"));
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	observed.failCommandWithWarning = true;
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
		}),
	).rejects.toThrow(/git rev-parse --is-inside-work-tree failed: warning/);
});

test("reports timeout separately from a git warning", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-command-warning-"));
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	observed.warningBeforeStall = true;
	const result = await runCommand(
		"git",
		["rev-parse", "--is-inside-work-tree"],
		root,
		new AbortController().signal,
		false,
		{ timeoutMs: 50 },
	);
	expect(result).toMatchObject({ termination: "timeout", stderr: "warning\n" });
});

test("reports abort separately from timeout and child stderr", async () => {
	root = await mkdtemp(join(tmpdir(), "drive-command-abort-"));
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	observed.warningBeforeStall = true;
	const controller = new AbortController();
	const result = runCommand(
		"git",
		["rev-parse", "--is-inside-work-tree"],
		root,
		controller.signal,
		false,
		{ timeoutMs: 60_000 },
	);
	setTimeout(() => controller.abort(), 180);
	await expect(result).resolves.toMatchObject({
		termination: "abort",
		exitCode: 124,
	});
});

test.each([
	"legacy",
	"graph",
] as const)("%s refuses warning-producing timed-out snapshot preflight before spawn", async (route) => {
	root = await mkdtemp(join(tmpdir(), "drive-preflight-warning-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	const manager = new TaskManager(root);
	await manager.init();
	const task = await manager.createTask({ title: "Snapshot preflight" });
	const workdir = join(root, "missions", "sessions", "plan", "runs", "run-1");
	await mkdir(workdir, { recursive: true });
	const envelopePath = join(root, "envelope.md");
	await writeFile(envelopePath, "Envelope");
	const spec: DriverRunSpec = {
		runId: "run-1",
		parentSessionId: "parent",
		projectRoot: root,
		planSlug: "plan",
		taskIds: [task.id],
		backendName: "codex",
		promptTemplate: { envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		stateCommitPolicy: "none",
		workdir,
		eventLogPath: join(workdir, "events.jsonl"),
	};
	let spawned = false;
	const backend = {
		name: "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		async run() {
			spawned = true;
			return { exitCode: 0, stdout: "outcome: success", durationMs: 1 };
		},
	};
	observed.stallCommand = "rev-parse --is-inside-work-tree";
	observed.warningBeforeStall = true;
	const ctx = {
		taskManager: manager,
		backend,
		eventSink: async () => {},
		parentSessionId: "parent",
		runId: "run-1",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: resolve("."),
		mode: "inline" as const,
	};
	if (route === "legacy")
		await expect(runOneTask(spec, ctx, task.id)).rejects.toThrow(
			/git rev-parse --is-inside-work-tree failed: timed out/,
		);
	else {
		const result = await runDriveOnGraph(spec, ctx);
		expect(result).toMatchObject({
			outcome: "blocked",
			blockedReason: expect.stringMatching(
				/git rev-parse --is-inside-work-tree failed: timed out/,
			),
		});
	}
	expect(spawned).toBe(false);
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

test.each([
	"timeout",
	"abort",
] as const)("settles a %s snapshot git despite inherited pipes", async (route) => {
	root = await mkdtemp(join(tmpdir(), "drive-snapshot-inherited-"));
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
	git("init", "-q", "-b", "main");
	git("config", "user.name", "Test");
	git("config", "user.email", "test@example.com");
	await writeFile(join(root, "tracked"), "base");
	git("add", "tracked");
	git("commit", "-q", "-m", "base");
	await writeFile(join(root, "tracked"), "changed");
	observed.stallCommand = "add -A";
	observed.inheritedPipe = true;
	const controller = new AbortController();
	if (route === "abort") observed.abortAdd = () => controller.abort();
	const started = Date.now();
	await expect(
		snapshotWorktree({
			projectRoot: root,
			runId: "run-1",
			taskId: "TASK-1",
			attemptNumber: 1,
			signal: controller.signal,
		}),
	).rejects.toThrow(
		route === "abort"
			? /git .*add -A.*failed: aborted/
			: /git .*add -A.*failed: timed out/,
	);
	expect(observed.commands.some((command) => command.includes("add -A"))).toBe(
		true,
	);
	expect(Date.now() - started).toBeLessThan(1800);
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
