import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test, vi } from "vitest";
import { probeJournalDirectory } from "../../lib/agents/drive-worker-tool-guard.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import { getRepoCommitLockPath } from "../../lib/driver/lock.ts";
import {
	deriveOutcome,
	type RunOneTaskCtx,
	runOneTask,
} from "../../lib/driver/run-one-task.ts";
import { pendingFinalizationPath } from "../../lib/driver/run-state.ts";
import type {
	DriverEvent,
	DriverRunSpec,
	EventSink,
	ParsedReport,
	Report,
	ReportOutcome,
} from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import type { Task, TaskUpdateInput } from "../../lib/tasks/task-types.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("run-one-task-test-");
const execFileAsync = promisify(execFile);

describe("run-one-task", () => {
	test.each([
		"blocked",
		"success",
	] as const)("snapshots tracked and untracked bytes before spawn and %s retains only unfinished refs", async (result) => {
		const fixture = await setupGitFixture();
		await git(fixture.projectRoot, ["add", "missions"]);
		await git(fixture.projectRoot, ["commit", "-m", "track tasks"]);
		await writeProjectFile(fixture, "README.md", "changed\n\u0000bytes");
		await writeProjectFile(fixture, "new.txt", "untracked\n\u0000bytes");
		const beforeNotes = "worker sentinel  \nsecond line";
		await fixture.taskManager.updateTask(fixture.taskId, {
			implementationNotes: beforeNotes,
		});
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await git(fixture.projectRoot, ["checkout", "--", "README.md"]);
			await rm(join(fixture.projectRoot, "new.txt"));
			return result === "blocked"
				? { exitCode: 0, stdout: "outcome: blocked", durationMs: 1 }
				: successfulResult();
		});
		await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);
		const ref = `refs/cosmonauts/drive/run-255/${fixture.taskId}/attempt-1`;
		expect(
			events.find((event) => event.type === "spawn_started"),
		).toMatchObject({ worktreeSnapshot: ref });
		const notes = (await fixture.taskManager.getTask(fixture.taskId))
			?.implementationNotes;
		// INV-001, D-033: the snapshot belongs inside the attempt record, never before it.
		if (result === "blocked") {
			expect(notes).toContain(
				`${beforeNotes}\n\n### Drive — outcome blocked — attempt 1 — run run-255\n\nWorktree snapshot: ${ref}\n`,
			);
			await git(fixture.projectRoot, [
				"restore",
				"--source",
				ref,
				"--",
				"README.md",
			]);
			await git(fixture.projectRoot, ["show", `${ref}:new.txt`]).then((bytes) =>
				writeProjectFile(fixture, "new.txt", bytes),
			);
			expect(
				await readFile(join(fixture.projectRoot, "README.md"), "utf8"),
			).toBe("changed\n\u0000bytes");
			expect(await readFile(join(fixture.projectRoot, "new.txt"), "utf8")).toBe(
				"untracked\n\u0000bytes",
			);
		} else {
			expect(notes).toBe(beforeNotes);
			await expect(
				git(fixture.projectRoot, ["rev-parse", "--verify", ref]),
			).rejects.toThrow();
		}
	});
	test.each([
		["blocked", "blocked"],
		["failure", "failure"],
		["partial", "partial"],
		["unknown", "unknown"],
		["spawn failure", "failure"],
	] as const)("writes one %s attempt record with a snapshot line only for dirty trees", async (report, outcome) => {
		for (const dirty of [false, true]) {
			const fixture = await setupGitFixture();
			await writeProjectFile(fixture, ".gitignore", "missions/\n");
			await git(fixture.projectRoot, ["add", ".gitignore"]);
			await git(fixture.projectRoot, ["commit", "-m", "ignore task state"]);
			if (dirty) await writeProjectFile(fixture, "dirty.txt", "unfinished");
			const beforeNotes = "worker sentinel  \nsecond line";
			await fixture.taskManager.updateTask(fixture.taskId, {
				implementationNotes: beforeNotes,
			});
			const events: DriverEvent[] = [];
			const backend = createBackend(async () =>
				report === "spawn failure"
					? { exitCode: 2, stdout: "", durationMs: 1 }
					: {
							exitCode: 0,
							stdout:
								report === "unknown"
									? "unstructured"
									: `\`\`\`json\n${JSON.stringify({ outcome: report, files: [], verification: [], notes: "needs work" })}\n\`\`\``,
							durationMs: 1,
						},
			);
			await runOneTask(
				createSpec(fixture),
				createCtx(fixture, backend, events),
				fixture.taskId,
			);
			const notes =
				(await fixture.taskManager.getTask(fixture.taskId))
					?.implementationNotes ?? "";
			const ref = `refs/cosmonauts/drive/run-255/${fixture.taskId}/attempt-1`;
			expect(
				notes.startsWith(
					`${beforeNotes}\n\n### Drive — outcome ${outcome} — attempt 1 — run run-255\n\n${dirty ? `Worktree snapshot: ${ref}\n` : ""}`,
				),
			).toBe(true);
			expect(notes.match(/### Drive — outcome /g)).toHaveLength(1);
			expect(notes.includes("Worktree snapshot:")).toBe(dirty);
			expect(
				events.find((event) => event.type === "spawn_started"),
			).toMatchObject(
				dirty ? { worktreeSnapshot: ref } : { type: "spawn_started" },
			);
			await rm(fixture.projectRoot, { recursive: true, force: true });
		}
	});

	test.each([
		"preflight",
		"postflight",
		"during-postflight",
	] as const)("blocks a %s probe journal before verification or commit", async (phase) => {
		const fixture = await setupGitFixture();
		const journal = join(
			probeJournalDirectory(fixture.projectRoot),
			"journal-corrupt",
		);
		const events: DriverEvent[] = [];
		const run = vi.fn(async () => {
			if (phase === "postflight") await mkdir(journal, { recursive: true });
			return successfulResult();
		});
		if (phase === "preflight") await mkdir(journal, { recursive: true });
		try {
			const outcome = await runOneTask(
				createSpec(fixture, {
					postflightCommands: [
						phase === "during-postflight"
							? nodeCommand(
									`require('fs').mkdirSync(${JSON.stringify(journal)}, { recursive: true })`,
								)
							: nodeCommand("process.exit(7)"),
					],
				}),
				createCtx(fixture, createBackend(run), events),
				fixture.taskId,
			);
			expect(outcome).toMatchObject({
				status: "blocked",
				reason: expect.stringContaining(`recovery-required: ${journal}`),
			});
			expect(events.some((event) => event.type === "verify")).toBe(
				phase === "during-postflight",
			);
			expect(run).toHaveBeenCalledTimes(phase === "preflight" ? 0 : 1);
			expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
				"Blocked",
			);
		} finally {
			await rm(probeJournalDirectory(fixture.projectRoot), {
				recursive: true,
				force: true,
			});
		}
	});
	test("run-one-task happy path marks the task done and emits spawn_completed", async () => {
		const fixture = await setupFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toEqual({ status: "done", commitSha: undefined });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Done",
		);
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_done",
		]);
		expect(events.find(isSpawnCompleted)?.report).toMatchObject({
			outcome: "success",
		});
	});

	test.each([
		"driver-commits",
		"no-commit",
		"backend-commits",
	] as const)("stops a blocked report before postflight or retry with %s", async (commitPolicy) => {
		const fixture = await setupGitFixture();
		await fixture.taskManager.updateTask(fixture.taskId, {
			implementationNotes: "worker sentinel  \n",
		});
		await writeProjectFile(fixture, "existing.txt", "present");
		const events: DriverEvent[] = [];
		const reason = "Need human review of existing.txt\nsecond line";
		const backend = createBackend(async () => ({
			exitCode: 0,
			stdout: `\`\`\`json\n${JSON.stringify({ outcome: "blocked", notes: reason })}\n\`\`\``,
			durationMs: 1,
		}));
		const outcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy,
				postflightCommands: [nodeCommand("process.exit(9)")],
			}),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);
		const task = await fixture.taskManager.getTask(fixture.taskId);
		expect(outcome).toEqual({ status: "blocked", reason });
		expect(task?.status).toBe("Blocked");
		// INV-001, D-033: replace the slice-10 standalone snapshot expectation.
		expect(task?.implementationNotes).toContain(
			`worker sentinel  \n\n### Drive — outcome blocked — attempt 1 — run run-255\n\nWorktree snapshot: refs/cosmonauts/drive/run-255/${fixture.taskId}/attempt-1\n${reason}`,
		);
		expect(
			task?.implementationNotes?.match(/### Drive — outcome blocked/g),
		).toHaveLength(1);
		if (commitPolicy !== "backend-commits") {
			expect(task?.implementationNotes).toContain(
				"Dirty paths:\n?? existing.txt",
			);
		}
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_blocked",
		]);
		expect(events.find((event) => event.type === "task_blocked")).toMatchObject(
			{ reason },
		);
		expect(backend.run).toHaveBeenCalledTimes(1);
	});

	test("records a backend commit as unverified when its report blocks", async () => {
		const fixture = await setupGitFixture();
		const before = (
			await git(fixture.projectRoot, ["rev-parse", "HEAD"])
		).trim();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "work.txt", "unfinished");
			await git(fixture.projectRoot, ["add", "work.txt"]);
			await git(fixture.projectRoot, ["commit", "-m", "unfinished"]);
			return { exitCode: 0, stdout: "outcome: blocked", durationMs: 1 };
		});
		const outcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "backend-commits" }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);
		const after = (
			await git(fixture.projectRoot, ["rev-parse", "HEAD"])
		).trim();
		expect(outcome).toMatchObject({
			status: "blocked",
			reason: "outcome: blocked",
		});
		expect(
			(await fixture.taskManager.getTask(fixture.taskId))?.implementationNotes,
		).toContain(`Unverified commits: ${before}..${after}`);
		expect(events.find((event) => event.type === "task_blocked")).toMatchObject(
			{ unverifiedCommits: `${before}..${after}` },
		);
	});

	test("run-one-task blocks success reports when acceptance criteria remain unchecked", async () => {
		const fixture = await setupFixture();
		const existing = await fixture.taskManager.getTask(fixture.taskId);
		if (!existing) {
			throw new Error("Fixture task not found");
		}
		await fixture.taskManager.updateTask(fixture.taskId, {
			acceptanceCriteria: [
				{ index: 1, text: "Ship the behavior", checked: false },
			],
		});
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		const task = await fixture.taskManager.getTask(fixture.taskId);
		expect(outcome).toMatchObject({
			status: "blocked",
			reason: expect.stringContaining("acceptance criteria still unchecked"),
		});
		expect(task?.status).toBe("Blocked");
		expect(task?.implementationNotes).toContain(
			"acceptance criteria still unchecked: #1",
		);
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_blocked",
		]);
	});

	test("run-one-task preflight failure returns blocked without TaskManager updates", async () => {
		const fixture = await setupRecordingFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());
		const spec = createSpec(fixture, {
			preflightCommands: [
				nodeCommand("process.stderr.write('nope'); process.exit(7)"),
			],
		});

		const outcome = await runOneTask(
			spec,
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expectPreflightBlocked({
			outcome,
			fixture,
			backend,
			events,
			details: { command: expect.any(String) },
		});
	});

	test("run-one-task branch mismatch aborts before any status transition", async () => {
		const fixture = await setupRecordingGitFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => successfulResult());

		const outcome = await runOneTask(
			createSpec(fixture, { branch: "not-main" }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expectPreflightBlocked({
			outcome,
			fixture,
			backend,
			events,
			details: { branch: "main" },
		});
	});

	test("preserves worker notes and records unknown output before inferred success", async () => {
		const fixture = await setupFixture();
		await fixture.taskManager.updateTask(fixture.taskId, {
			implementationNotes: "worker sentinel  \nsecond line",
		});
		const raw = "Unstructured output\nline two";
		const events: DriverEvent[] = [];
		const outcome = await runOneTask(
			createSpec(fixture, {
				postflightCommands: [nodeCommand("process.exit(0)")],
			}),
			createCtx(
				fixture,
				createBackend(async () => ({
					exitCode: 0,
					stdout: raw,
					durationMs: 1,
				})),
				events,
			),
			fixture.taskId,
		);
		const notes = (await fixture.taskManager.getTask(fixture.taskId))
			?.implementationNotes;
		expect(outcome.status).toBe("done");
		expect(notes).toContain("worker sentinel  \nsecond line");
		expect(notes).toContain(
			"### Drive — outcome unknown — attempt 1 — run run-255\n\nUnstructured output\nline two",
		);
		expect(notes?.match(/### Drive — outcome unknown/g)).toHaveLength(1);
	});

	test("aborts unknown inference if the raw record cannot be appended", async () => {
		const fixture = await setupRecordingFixture();
		const events: DriverEvent[] = [];
		const originalUpdate = fixture.taskManager.updateTask.bind(
			fixture.taskManager,
		);
		fixture.taskManager.updateTask = async (id, input) => {
			if (input.appendImplementationNotes)
				throw new Error("note persistence failed");
			return originalUpdate(id, input);
		};
		await expect(
			runOneTask(
				createSpec(fixture, {
					postflightCommands: [nodeCommand("process.exit(0)")],
				}),
				createCtx(
					fixture,
					createBackend(async () => ({
						exitCode: 0,
						stdout: "raw",
						durationMs: 1,
					})),
					events,
				),
				fixture.taskId,
			),
		).rejects.toThrow("note persistence failed");
		expect(events.some((event) => event.type === "verify")).toBe(false);
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"In Progress",
		);
	});

	test("driver task fields literal uses Title Case and implementationNotes, never note", async () => {
		const fixture = await setupRecordingFixture();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => failureResult("needs follow-up"));

		const outcome = await runOneTask(
			createSpec(fixture),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({ status: "blocked" });
		// AC-020: the former replace-note expectation pinned the note-loss defect.
		expect(fixture.taskManager.updates).toEqual([
			{ status: "In Progress" },
			{
				appendImplementationNotes:
					"### Drive — outcome failure — attempt 1 — run run-255\n\nneeds follow-up",
			},
			{ status: "Blocked" },
		]);
		for (const update of fixture.taskManager.updates) {
			expect(update).not.toHaveProperty("note");
		}
	});

	test("driver commit exclusion uses repo lock excludes missions and memory and emits sha", async () => {
		const fixture = await setupGitFixture();
		await writeFile(
			join(fixture.projectRoot, ".gitignore"),
			".cosmonauts/*.lock\n",
			"utf-8",
		);
		await git(fixture.projectRoot, ["add", ".gitignore"]);
		await git(fixture.projectRoot, ["commit", "-m", "ignore lock files"]);
		const frameworkRoot = join(temp.path, "framework-root");
		await mkdir(frameworkRoot, { recursive: true });
		await installCommitHook(fixture.projectRoot);
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/changed.txt", "commit\n");
			await writeProjectFile(fixture, "missions/agent/ignored.txt", "ignore\n");
			await writeProjectFile(fixture, "memory/ignored.txt", "ignore\n");
			return successfulResult();
		});
		const eventSink: EventSink = async (event) => {
			events.push(event);
			if (event.type === "commit_made") {
				await expect(
					stat(getRepoCommitLockPath(fixture.projectRoot)),
				).rejects.toMatchObject({ code: "ENOENT" });
			}
		};

		const outcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(fixture, backend, events, {
				eventSink,
				cosmonautsRoot: frameworkRoot,
			}),
			fixture.taskId,
		);

		const commit = events.find(isCommitMade);
		expect(outcome.status).toBe("done");
		expect(outcome.commitSha).toBe(commit?.sha);
		expect(commit?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(
			await readFile(join(fixture.projectRoot, "hook-observed.txt"), "utf-8"),
		).toBe("lock-present\n");
		const committedFiles = await git(fixture.projectRoot, [
			"show",
			"--name-only",
			"--format=",
			"HEAD",
		]);
		expect(committedFiles.trim().split("\n")).toEqual(["src/changed.txt"]);
		const ignoredStatus = await git(fixture.projectRoot, [
			"status",
			"--porcelain",
			"--",
			"missions",
			"memory",
		]);
		expect(ignoredStatus).toContain("missions/");
		expect(ignoredStatus).toContain("memory/");
	});

	test("emits commit and task-status finalization phase events on successful driver commit", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/finalized.txt", "commit\n");
			return successfulResult();
		});

		const { events, outcome, task } = await runDriverCommitTask(
			fixture,
			backend,
		);

		expect(outcome).toMatchObject({
			status: "done",
			commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(task?.status).toBe("Done");
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"verify",
			"verify",
			"finalize",
			"commit_made",
			"finalize",
			"finalize",
			"finalize",
			"task_done",
		]);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "commit",
				status: "started",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "commit",
				status: "passed",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "task_status",
				status: "started",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "task_status",
				status: "passed",
			}),
		);
	});

	test("uses task title as driver commit subject when report summary is generic", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/titled.txt", "commit\n");
			return {
				exitCode: 0,
				stdout: fencedReport({
					outcome: "success",
					files: [],
					verification: [],
					notes: "driver task update",
				}),
				durationMs: 1,
			};
		});

		const { events, outcome } = await runDriverCommitTask(fixture, backend);

		expect(outcome.status).toBe("done");
		const subject = (
			events.find(isCommitMade) as
				| Extract<DriverEvent, { type: "commit_made" }>
				| undefined
		)?.subject;
		expect(subject).toBe(`${fixture.taskId}: Run One Task Fixture`);
		expect(
			await git(fixture.projectRoot, ["show", "--format=%s", "--no-patch"]),
		).toContain(`${fixture.taskId}: Run One Task Fixture`);
	});

	test("emits explicit no-change commit finalization evidence for verification-only tasks", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => successfulResult());

		const { events, outcome, task } = await runDriverCommitTask(
			fixture,
			backend,
		);

		expect(outcome).toEqual({ status: "done", commitSha: undefined });
		expect(task?.status).toBe("Done");
		expect(events.map((event) => event.type)).not.toContain("commit_made");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "commit",
				status: "skipped",
				details: { reason: "no_changes" },
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "task_status",
				status: "passed",
			}),
		);
		expect(events.map((event) => event.type)).toContain("task_done");
	});

	test("driver derive outcome uses postverify as objective evidence", () => {
		const unknown = {
			outcome: "unknown",
			raw: "no report",
		} satisfies ParsedReport;
		const pass = [{ command: "test", status: "pass" }] as const;
		const fail = [{ command: "test", status: "fail", stderr: "bad" }] as const;

		expect(deriveOutcome(unknown, [])).toBe("failure");
		expect(deriveOutcome(unknown, pass)).toBe("failure");
		expect(deriveOutcome(unknown, pass, { allowUnknownSuccess: true })).toBe(
			"success",
		);
		expect(deriveOutcome(unknown, fail, { allowUnknownSuccess: true })).toBe(
			"failure",
		);
		expect(deriveOutcome(report("success"), fail)).toBe("failure");
		expect(deriveOutcome(report("failure"), pass)).toBe("failure");
		expect(deriveOutcome(report("partial"), fail)).toBe("failure");
	});

	test("driver task timeout aborts the spawn and blocks with implementationNotes", async () => {
		const fixture = await setupFixture();
		const events: DriverEvent[] = [];
		let observedSignal: AbortSignal | undefined;
		const backend = createBackend(async (invocation) => {
			observedSignal = invocation.signal;
			return new Promise<BackendRunResult>(() => {});
		});

		const outcome = await runOneTask(
			createSpec(fixture, { taskTimeoutMs: 10 }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(observedSignal?.aborted).toBe(true);
		expect(outcome).toMatchObject({ status: "blocked" });
		expect((await fixture.taskManager.getTask(fixture.taskId))?.status).toBe(
			"Blocked",
		);
		expect(
			(await fixture.taskManager.getTask(fixture.taskId))?.implementationNotes,
		).toContain("timed out");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "spawn_failed",
				exitCode: 124,
			}),
		);
	});

	test("records finalization_failed instead of blocked when driver commit fails after passing postflight", async () => {
		const fixture = await setupGitFixture();
		await installFailingCommitHook(fixture.projectRoot);
		const headBeforeFinalization = (
			await git(fixture.projectRoot, ["rev-parse", "HEAD"])
		).trim();
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/commit-fails.txt", "commit\n");
			return successfulResult();
		});

		const outcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy: "driver-commits",
				postflightCommands: [nodeCommand("process.exit(0)")],
			}),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({
			status: "finalization_failed",
			finalizationPhase: "commit",
			pendingFinalizationPath: pendingFinalizationPath(fixture.workdir),
		});
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "commit",
				status: "failed",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_finalization_failed",
				taskId: fixture.taskId,
				phase: "commit",
				retryable: true,
			}),
		);
		expect(events.map((event) => event.type)).not.toContain("task_blocked");
		const pending = JSON.parse(
			await readFile(pendingFinalizationPath(fixture.workdir), "utf-8"),
		);
		expect(pending).toMatchObject({
			runId: "run-255",
			planSlug: "driver-primitives",
			phase: "commit",
			taskId: fixture.taskId,
			headBeforeFinalization,
			commitPolicy: "driver-commits",
		});
		const task = await fixture.taskManager.getTask(fixture.taskId);
		expect(task?.status).toBe("In Progress");
		// AC-020: finalization failures now retain the worker's note and append a Drive record.
		expect(task?.implementationNotes).toContain(
			"### Drive — outcome failure — attempt unknown — run run-255",
		);
		expect(task?.implementationNotes).toContain(
			"commit failed: commit rejected by test hook",
		);
	});

	test("retains the partial attempt record when commit finalization fails", async () => {
		const fixture = await setupGitFixture();
		await fixture.taskManager.updateTask(fixture.taskId, {
			implementationNotes: "worker sentinel  ",
		});
		await installFailingCommitHook(fixture.projectRoot);
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/partial-fails.txt", "partial\n");
			return {
				exitCode: 0,
				stdout: fencedReport({
					outcome: "partial",
					files: [],
					verification: [],
					notes: "needs work",
				}),
				durationMs: 1,
			};
		});
		const result = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(fixture, backend, []),
			fixture.taskId,
		);
		expect(result.status).toBe("blocked");
		const notes =
			(await fixture.taskManager.getTask(fixture.taskId))
				?.implementationNotes ?? "";
		expect(notes).toContain("worker sentinel  ");
		expect(notes).toContain(
			"### Drive — outcome partial — attempt 1 — run run-255",
		);
		expect(notes).toContain(
			"### Drive — outcome failure — attempt unknown — run run-255",
		);
	});

	test("records finalization_failed with commit sha when task status update fails after commit", async () => {
		const fixture = await setupRecordingGitFixture();
		fixture.taskManager.failFinalUpdate = true;
		const events: DriverEvent[] = [];
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/after-commit.txt", "commit\n");
			return successfulResult();
		});

		const outcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(fixture, backend, events),
			fixture.taskId,
		);

		expect(outcome).toMatchObject({
			status: "finalization_failed",
			finalizationPhase: "task_status",
			finalizationCommitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
			pendingFinalizationPath: pendingFinalizationPath(fixture.workdir),
		});
		if (outcome.status !== "finalization_failed") {
			throw new Error("expected finalization_failed outcome");
		}
		const finalizationCommitSha = outcome.finalizationCommitSha;
		expect(events.map((event) => event.type)).toContain("commit_made");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "finalize",
				phase: "task_status",
				status: "failed",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_finalization_failed",
				taskId: fixture.taskId,
				phase: "task_status",
				commitSha: finalizationCommitSha,
				retryable: true,
			}),
		);
		expect(events.map((event) => event.type)).not.toContain("task_done");
		const pending = JSON.parse(
			await readFile(pendingFinalizationPath(fixture.workdir), "utf-8"),
		);
		expect(pending).toMatchObject({
			runId: "run-255",
			phase: "task_status",
			taskId: fixture.taskId,
			commitSha: finalizationCommitSha,
		});
		expect(
			await git(fixture.projectRoot, [
				"show",
				"--format=%s",
				"--no-patch",
				"HEAD",
			]),
		).toContain(`${fixture.taskId}: Recording Fixture`);
	});

	test("does not write pending finalization for backend or postflight failures", async () => {
		const fixture = await setupGitFixture();

		const preflightEvents: DriverEvent[] = [];
		const preflightOutcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy: "driver-commits",
				preflightCommands: [nodeCommand("process.exit(1)")],
			}),
			createCtx(
				fixture,
				createBackend(async () => successfulResult()),
				preflightEvents,
			),
			fixture.taskId,
		);

		const backendFailureEvents: DriverEvent[] = [];
		const backendFailureOutcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(
				fixture,
				createBackend(async () => {
					throw new Error("backend failed");
				}),
				backendFailureEvents,
			),
			fixture.taskId,
		);

		const reportFailureEvents: DriverEvent[] = [];
		const reportFailureOutcome = await runOneTask(
			createSpec(fixture, { commitPolicy: "driver-commits" }),
			createCtx(
				fixture,
				createBackend(async () => failureResult("implementation failed")),
				reportFailureEvents,
			),
			fixture.taskId,
		);

		const postflightEvents: DriverEvent[] = [];
		const postflightOutcome = await runOneTask(
			createSpec(fixture, {
				commitPolicy: "driver-commits",
				postflightCommands: [
					nodeCommand(
						"process.stderr.write('postflight failed'); process.exit(1)",
					),
				],
			}),
			createCtx(
				fixture,
				createBackend(async () => {
					await writeProjectFile(fixture, "src/dirty.txt", "dirty\n");
					return successfulResult();
				}),
				postflightEvents,
			),
			fixture.taskId,
		);

		expect(preflightOutcome).toMatchObject({ status: "blocked" });
		expect(backendFailureOutcome).toMatchObject({ status: "blocked" });
		expect(reportFailureOutcome).toMatchObject({ status: "blocked" });
		expect(postflightOutcome).toMatchObject({ status: "blocked" });
		await expect(
			readFile(pendingFinalizationPath(fixture.workdir), "utf-8"),
		).rejects.toMatchObject({ code: "ENOENT" });
		expect(preflightEvents.map((event) => event.type)).toContain("preflight");
		expect(backendFailureEvents.map((event) => event.type)).toContain(
			"task_blocked",
		);
		expect(reportFailureEvents.map((event) => event.type)).toContain(
			"task_blocked",
		);
		expect(postflightEvents.map((event) => event.type)).toContain(
			"task_blocked",
		);
		expect([
			...preflightEvents.map((event) => event.type),
			...backendFailureEvents.map((event) => event.type),
			...reportFailureEvents.map((event) => event.type),
			...postflightEvents.map((event) => event.type),
		]).not.toContain("task_finalization_failed");
		expect(postflightEvents.map((event) => event.type)).not.toContain(
			"commit_made",
		);
	});

	test("driver partial outcome commits and leaves task In Progress with progress notes", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/partial.txt", "partial\n");
			return {
				exitCode: 0,
				stdout: fencedReport({
					outcome: "partial",
					files: [],
					verification: [],
					notes: "needs another pass",
					progress: { phase: 1, of: 2, remaining: "tests" },
				}),
				durationMs: 1,
			};
		});

		const { events, outcome, task } = await runDriverCommitTask(
			fixture,
			backend,
		);
		expect(outcome).toMatchObject({
			status: "partial",
			commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(task?.status).toBe("In Progress");
		expect(task?.implementationNotes).toContain("partial: phase 1/2");
		expect(task?.implementationNotes).toContain("remaining: tests");
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				reason: expect.stringContaining("partial"),
				progress: { phase: 1, of: 2, remaining: "tests" },
			}),
		);
		expect(events.map((event) => event.type)).toContain("commit_made");
	});

	test("run-one-task infers success for unknown reports when postverify passes and changes exist", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => {
			await writeProjectFile(fixture, "src/uncommitted.txt", "commit\n");
			return {
				exitCode: 0,
				stdout:
					"Implemented: changed src/uncommitted.txt and postflight passed",
				durationMs: 1,
			};
		});

		const { events, outcome, task } = await runDriverCommitTask(
			fixture,
			backend,
		);
		expect(outcome).toMatchObject({
			status: "done",
			commitSha: expect.stringMatching(/^[0-9a-f]{40}$/),
		});
		expect(task?.status).toBe("Done");
		expect(events.map((event) => event.type)).toContain("commit_made");
		expect(
			await git(fixture.projectRoot, ["show", "--format=%s", "--no-patch"]),
		).toContain("changed src/uncommitted.txt");
		const staged = await git(fixture.projectRoot, [
			"diff",
			"--cached",
			"--name-only",
		]);
		expect(staged).toBe("");
	});

	test("run-one-task still blocks unknown reports when postverify passes without changes", async () => {
		const fixture = await setupGitFixture();
		const backend = createBackend(async () => ({
			exitCode: 0,
			stdout: "I inspected the task but did not change files.",
			durationMs: 1,
		}));

		const { events, outcome, task } = await runDriverCommitTask(
			fixture,
			backend,
		);
		expect(outcome).toMatchObject({ status: "blocked" });
		expect(task?.status).toBe("Blocked");
		// AC-020: unknown raw output, rather than a synthetic reason, is the durable record.
		expect(task?.implementationNotes).toContain(
			"I inspected the task but did not change files.",
		);
		expect(events.map((event) => event.type)).not.toContain("commit_made");
	});
});

interface Fixture {
	projectRoot: string;
	workdir: string;
	envelopePath: string;
	taskId: string;
	taskManager: TaskManager;
}

interface RecordingFixture extends Omit<Fixture, "taskManager"> {
	taskManager: RecordingTaskManager;
}

async function setupFixture(): Promise<Fixture> {
	const projectRoot = join(temp.path, "project");
	const workdir = join(temp.path, "run");
	const templateDir = join(temp.path, "templates");
	await mkdir(templateDir, { recursive: true });
	await mkdir(workdir, { recursive: true });

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Run One Task Fixture",
		description: "Implement this fixture task.",
	});
	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Envelope instructions", "utf-8");

	return { projectRoot, workdir, envelopePath, taskId: task.id, taskManager };
}

async function setupRecordingFixture(): Promise<RecordingFixture> {
	const projectRoot = join(temp.path, "project");
	const workdir = join(temp.path, "run");
	const templateDir = join(temp.path, "templates");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(templateDir, { recursive: true });
	await mkdir(workdir, { recursive: true });
	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, "Envelope instructions", "utf-8");
	const task = createTask("TASK-255");

	return {
		projectRoot,
		workdir,
		envelopePath,
		taskId: task.id,
		taskManager: new RecordingTaskManager(projectRoot, task),
	};
}

async function setupGitFixture(): Promise<Fixture> {
	const fixture = await setupFixture();
	await initGit(fixture.projectRoot);
	return fixture;
}

async function setupRecordingGitFixture(): Promise<RecordingFixture> {
	const fixture = await setupRecordingFixture();
	await initGit(fixture.projectRoot);
	return fixture;
}

async function runDriverCommitTask(
	fixture: Fixture | RecordingFixture,
	backend: Backend,
): Promise<{
	events: DriverEvent[];
	outcome: Awaited<ReturnType<typeof runOneTask>>;
	task: Task | null;
}> {
	const events: DriverEvent[] = [];
	const outcome = await runOneTask(
		createSpec(fixture, {
			commitPolicy: "driver-commits",
			postflightCommands: [nodeCommand("process.exit(0)")],
		}),
		createCtx(fixture, backend, events),
		fixture.taskId,
	);
	const task = await fixture.taskManager.getTask(fixture.taskId);
	return { events, outcome, task };
}

async function writeProjectFile(
	fixture: Fixture | RecordingFixture,
	relativePath: string,
	content: string,
): Promise<void> {
	const absolutePath = join(fixture.projectRoot, relativePath);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, content, "utf-8");
}

function expectPreflightBlocked({
	outcome,
	fixture,
	backend,
	events,
	details,
}: {
	outcome: Awaited<ReturnType<typeof runOneTask>>;
	fixture: RecordingFixture;
	backend: ReturnType<typeof createBackend>;
	events: DriverEvent[];
	details: Record<string, unknown>;
}): void {
	expect(outcome).toMatchObject({ status: "blocked" });
	expect(fixture.taskManager.updates).toEqual([]);
	expect(backend.run).not.toHaveBeenCalled();
	expect(events).toContainEqual(
		expect.objectContaining({
			type: "preflight",
			status: "failed",
			details: expect.objectContaining(details),
		}),
	);
}

function createSpec(
	fixture: Fixture | RecordingFixture,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-255",
		parentSessionId: "parent-session-255",
		projectRoot: fixture.projectRoot,
		planSlug: "driver-primitives",
		taskIds: [fixture.taskId],
		backendName: "cosmonauts-subagent",
		promptTemplate: { envelopePath: fixture.envelopePath },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: fixture.workdir,
		eventLogPath: join(fixture.workdir, "events.jsonl"),
		...overrides,
	};
}

function createCtx(
	fixture: Fixture | RecordingFixture,
	backend: Backend,
	events: DriverEvent[],
	overrides: Partial<RunOneTaskCtx> = {},
): RunOneTaskCtx {
	const eventSink: EventSink = async (event) => {
		events.push(event);
	};

	return {
		taskManager: fixture.taskManager,
		backend,
		eventSink,
		parentSessionId: "parent-session-255",
		runId: "run-255",
		abortSignal: new AbortController().signal,
		cosmonautsRoot: fixture.projectRoot,
		...overrides,
	};
}

function createBackend(
	run: (invocation: BackendInvocation) => Promise<BackendRunResult>,
): Backend & { run: ReturnType<typeof vi.fn> } {
	return {
		name: "test-backend",
		capabilities: { canCommit: false, isolatedFromHostSource: false },
		run: vi.fn(run),
	};
}

function successfulResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: fencedReport({ outcome: "success", files: [], verification: [] }),
		durationMs: 1,
	};
}

function failureResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: fencedReport({
			outcome: "failure",
			files: [],
			verification: [],
			notes,
		}),
		durationMs: 1,
	};
}

function fencedReport(report: Report): string {
	return `\`\`\`json\n${JSON.stringify(report)}\n\`\`\``;
}

function report(outcome: ReportOutcome): Report {
	return { outcome, files: [], verification: [] };
}

function createTask(id: string): Task {
	const now = new Date("2026-05-04T00:00:00.000Z");
	return {
		id,
		title: "Recording Fixture",
		status: "To Do",
		priority: "high",
		createdAt: now,
		updatedAt: now,
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	};
}

class RecordingTaskManager extends TaskManager {
	readonly updates: TaskUpdateInput[] = [];
	failFinalUpdate = false;
	private task: Task;

	constructor(projectRoot: string, task: Task) {
		super(projectRoot);
		this.task = task;
	}

	override async getTask(id: string): Promise<Task | null> {
		return id === this.task.id ? this.task : null;
	}

	override async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
		if (id !== this.task.id) {
			throw new Error(`Task not found: ${id}`);
		}
		if (this.failFinalUpdate && input.status === "Done") {
			throw new Error("update failed");
		}

		this.updates.push(input);
		this.task = {
			...this.task,
			...input,
			updatedAt: new Date("2026-05-04T00:01:00.000Z"),
			labels: input.labels ?? this.task.labels,
			dependencies: input.dependencies ?? this.task.dependencies,
			acceptanceCriteria:
				input.acceptanceCriteria ?? this.task.acceptanceCriteria,
		};
		return this.task;
	}
}

async function initGit(projectRoot: string): Promise<void> {
	await git(projectRoot, ["init", "-b", "main"]);
	await git(projectRoot, ["config", "user.email", "driver@example.com"]);
	await git(projectRoot, ["config", "user.name", "Driver Test"]);
	await writeFile(join(projectRoot, "README.md"), "initial\n", "utf-8");
	await git(projectRoot, ["add", "README.md"]);
	await git(projectRoot, ["commit", "-m", "initial"]);
}

async function installCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	const lockPath = getRepoCommitLockPath(projectRoot);
	const observedPath = join(projectRoot, "hook-observed.txt");
	const script = `#!/bin/sh
if test -f ${shellQuote(lockPath)}; then
  printf 'lock-present\n' > ${shellQuote(observedPath)}
else
  printf 'lock-missing\n' > ${shellQuote(observedPath)}
  exit 1
fi
if git diff --cached --name-only | grep -E '^(missions|memory)/'; then
  exit 1
fi
`;
	await writeFile(hookPath, script, "utf-8");
	await chmod(hookPath, 0o755);
}

async function installFailingCommitHook(projectRoot: string): Promise<void> {
	const hookPath = join(projectRoot, ".git", "hooks", "pre-commit");
	await writeFile(
		hookPath,
		"#!/bin/sh\nprintf 'commit rejected by test hook\\n' >&2\nexit 1\n",
		"utf-8",
	);
	await chmod(hookPath, 0o755);
}

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout.toString();
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function isSpawnCompleted(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "spawn_completed" }> {
	return event.type === "spawn_completed";
}

function isCommitMade(
	event: DriverEvent,
): event is Extract<DriverEvent, { type: "commit_made" }> {
	return event.type === "commit_made";
}
