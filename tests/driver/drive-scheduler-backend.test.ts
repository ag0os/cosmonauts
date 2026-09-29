import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { probeJournalDirectory } from "../../lib/agents/drive-worker-tool-guard.ts";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "../../lib/driver/backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "../../lib/driver/backends/types.ts";
import {
	finalizeDriveSourceCommit,
	parsedReportFromStepResult,
	reportOutcomeFromStepResult,
	transitionDriveTaskStatus,
} from "../../lib/driver/drive-finalization.ts";
import {
	createDriveSchedulerBackend,
	createDriveSchedulerBackendMap,
} from "../../lib/driver/drive-scheduler-backend.ts";
import type { DriverEvent, DriverRunSpec } from "../../lib/driver/types.ts";
import type {
	BackendContext,
	RunRecord,
	SchedulerStepInput,
	StepRecord,
} from "../../lib/durable-runtime/index.ts";
import { withEntityFileLock } from "../../lib/entity-file-lock.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

const temp = useTempDir("drive-scheduler-backend-");
const PLAN_SLUG = "durable-frontend-migration";
const PARENT_SESSION_ID = "drive-scheduler-parent";

describe("Drive scheduler backend", () => {
	test("keeps driver metadata in graph backend but not project commands", async () => {
		const fixture = await setupFixture("graph-env");
		await fixture.taskManager.createTask({ title: "Graph env fixture" });
		const key = "COSMONAUTS_DRIVER_TEST_SENTINEL";
		const previous = process.env[key];
		process.env[key] = "backend-only";
		try {
			const check = `node -e "if (Object.keys(process.env).some(key => key.startsWith('COSMONAUTS_DRIVER_'))) process.exit(8)"`;
			const run = vi.fn(async () => {
				expect(process.env[key]).toBe("backend-only");
				return successfulBackendResult();
			});
			const prepared = await prepareTaskStep({
				fixture,
				spec: createSpec(fixture, {
					preflightCommands: [check],
					postflightCommands: [check],
				}),
				events: [],
				backendRun: run,
			});
			const result = await (await prepared.backend.start(prepared.step)).result;
			expect(result.outcome).toBe("success");
			expect(run).toHaveBeenCalledOnce();
		} finally {
			if (previous === undefined) delete process.env[key];
			else process.env[key] = previous;
		}
	});
	test("blocks a source commit when a probe owns the project lock", async () => {
		const fixture = await setupFixture("probe-commit-lock");
		await fixture.taskManager.createTask({ title: "Locked commit" });
		const git = (args: string[]) =>
			execFileSync("git", args, {
				cwd: fixture.projectRoot,
				encoding: "utf8",
			}).trim();
		git(["init", "-b", "main"]);
		git([
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		]);
		await writeFile(join(fixture.projectRoot, "change.txt"), "changed");
		await mkdir(probeJournalDirectory(fixture.projectRoot), {
			recursive: true,
			mode: 0o700,
		});
		await withEntityFileLock(
			join(probeJournalDirectory(fixture.projectRoot), "probe.lock"),
			async () => {
				const result = await finalizeDriveSourceCommit({
					spec: createSpec(fixture, { commitPolicy: "driver-commits" }),
					ctx: {
						taskManager: fixture.taskManager,
						eventSink: async () => {},
						abortSignal: new AbortController().signal,
					},
					taskId: "TASK-1",
					outcome: "success",
					report: { outcome: "success", files: [], verification: [] },
				});
				expect(result).toMatchObject({
					status: "blocked",
					reason: expect.stringContaining("recovery-required"),
				});
				expect(git(["status", "--porcelain"])).toContain("change.txt");
				expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
					"Blocked",
				);
			},
		);
	});
	test.each([
		"Implemented the requested change",
		'```json\n{"outcome":"success"}\n```',
		'{"outcome":"success","files":[]}',
		'{"outcome":"success"}\nChanged behavior',
		"outcome: success",
		"summary: outcome: success",
		'summary: {"outcome":"success"}',
		"Outcome inferred from passing postflight.",
	])("uses safe prose or task title for graph commit subject: %s", async (summary) => {
		const fixture = await setupFixture(`graph-subject-${summary.length}`);
		await fixture.taskManager.createTask({ title: "Graph subject fixture" });
		const git = (...args: string[]) =>
			execFileSync("git", args, {
				cwd: fixture.projectRoot,
				encoding: "utf8",
			}).trim();
		git("init", "-b", "main");
		git(
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		);
		await writeFile(join(fixture.projectRoot, "change.txt"), "changed");
		const result = await finalizeDriveSourceCommit({
			spec: createSpec(fixture, { commitPolicy: "driver-commits" }),
			ctx: {
				taskManager: fixture.taskManager,
				eventSink: async () => {},
				abortSignal: new AbortController().signal,
			},
			taskId: "TASK-1",
			outcome: "success",
			report: parsedReportFromStepResult({
				outcome: "success",
				summary,
				artifacts: [],
				nextAction: "continue",
			}),
		});
		expect(result.status).toBe("committed");
		expect(git("show", "--format=%s", "--no-patch")).toBe(
			`TASK-1: ${summary === "Implemented the requested change" ? summary : "Graph subject fixture"}`,
		);
	});
	test.each([
		"blocked",
		"success",
	] as const)("snapshots dirty tracked and untracked bytes for external backend and %s cleanup", async (result) => {
		const fixture = await setupFixture(`snapshot-${result}`);
		await fixture.taskManager.createTask({ title: "Snapshot" });
		const git = (args: string[]) =>
			execFileSync("git", args, { cwd: fixture.projectRoot, encoding: "utf8" });
		git(["init", "-b", "main"]);
		git(["config", "user.email", "driver@example.com"]);
		git(["config", "user.name", "Driver Test"]);
		git(["add", "."]);
		git(["commit", "-m", "initial"]);
		await writeFile(
			join(fixture.projectRoot, "envelope.md"),
			"changed\n\u0000bytes",
		);
		await writeFile(
			join(fixture.projectRoot, "new.txt"),
			"untracked\n\u0000bytes",
		);
		const beforeNotes = "worker sentinel  \nsecond line";
		await fixture.taskManager.updateTask("TASK-1", {
			implementationNotes: beforeNotes,
		});
		const events: DriverEvent[] = [];
		const spec = createSpec(fixture);
		const prepared = await prepareTaskStep({
			fixture,
			spec,
			events,
			backendRun: async () => {
				git(["checkout", "--", "envelope.md"]);
				await rm(join(fixture.projectRoot, "new.txt"));
				return result === "blocked"
					? { exitCode: 0, stdout: "outcome: blocked", durationMs: 1 }
					: successfulBackendResult();
			},
		});
		const step = await (await prepared.backend.start(prepared.step)).result;
		const ref = "refs/cosmonauts/drive/run-drive-scheduler/TASK-1/attempt-1";
		expect(
			events.find((event) => event.type === "spawn_started"),
		).toMatchObject({ worktreeSnapshot: ref });
		const notes = (await fixture.taskManager.getTask("TASK-1"))
			?.implementationNotes;
		// INV-001, D-033: the snapshot belongs inside the attempt record, never before it.
		if (result === "blocked") {
			expect(notes).toContain(
				`${beforeNotes}\n\n### Drive — outcome blocked — attempt 1 — run ${spec.runId}\n\nWorktree snapshot: ${ref}\n`,
			);
			expect(git(["show", `${ref}:envelope.md`])).toBe("changed\n\u0000bytes");
			expect(git(["show", `${ref}:new.txt`])).toBe("untracked\n\u0000bytes");
		} else {
			expect(notes).toBe(beforeNotes);
			const final = await transitionDriveTaskStatus({
				spec,
				ctx: {
					taskManager: fixture.taskManager,
					eventSink: async () => {},
					abortSignal: new AbortController().signal,
				},
				taskId: "TASK-1",
				outcome: "success",
				parsedReport: { outcome: "success", files: [], verification: [] },
				failureReason: "",
			});
			// G2, INV-006, D-034: discarded snapshot bytes remain recoverable.
			expect(final).toMatchObject({ status: "done", retainedSnapshots: [ref] });
			expect(git(["show", `${ref}:new.txt`])).toBe("untracked\n\u0000bytes");
		}
		expect(step.outcome).toBe(result === "blocked" ? "blocked" : "success");
	});
	test("removes a Done snapshot when the final worktree contains its bytes", async () => {
		const fixture = await setupFixture("snapshot-contained");
		await fixture.taskManager.createTask({ title: "Snapshot" });
		const git = (args: string[]) =>
			execFileSync("git", args, { cwd: fixture.projectRoot, encoding: "utf8" });
		git(["init", "-b", "main"]);
		git(["config", "user.email", "driver@example.com"]);
		git(["config", "user.name", "Driver Test"]);
		await writeFile(join(fixture.projectRoot, ".gitignore"), "missions/\n");
		git(["add", "."]);
		git(["commit", "-m", "initial"]);
		await writeFile(join(fixture.projectRoot, "new.txt"), "present");
		const spec = createSpec(fixture, { commitPolicy: "no-commit" });
		const prepared = await prepareTaskStep({
			fixture,
			spec,
			events: [],
			backendRun: async () => successfulBackendResult(),
		});
		await (await prepared.backend.start(prepared.step)).result;
		const final = await transitionDriveTaskStatus({
			spec,
			ctx: {
				taskManager: fixture.taskManager,
				eventSink: async () => {},
				abortSignal: new AbortController().signal,
			},
			taskId: "TASK-1",
			outcome: "success",
			parsedReport: { outcome: "success", files: [], verification: [] },
			failureReason: "",
		});
		expect(final).toMatchObject({ status: "done" });
		expect("retainedSnapshots" in final).toBe(false);
		expect(() =>
			git([
				"rev-parse",
				"--verify",
				"refs/cosmonauts/drive/run-drive-scheduler/TASK-1/attempt-1",
			]),
		).toThrow();
	});

	test.each([
		["blocked", "blocked"],
		["failure", "failure"],
		["partial", "partial"],
		["unknown", "unknown"],
		["spawn failure", "failure"],
	] as const)("writes one %s attempt record with a snapshot line only for dirty trees", async (report, outcome) => {
		for (const dirty of [false, true]) {
			const fixture = await setupFixture(`record-${report}-${dirty}`);
			await fixture.taskManager.createTask({ title: "Snapshot record" });
			const git = (args: string[]) =>
				execFileSync("git", args, {
					cwd: fixture.projectRoot,
					encoding: "utf8",
				});
			git(["init", "-b", "main"]);
			git(["config", "user.email", "driver@example.com"]);
			git(["config", "user.name", "Driver Test"]);
			await writeFile(join(fixture.projectRoot, ".gitignore"), "missions/\n");
			git(["add", "envelope.md", ".gitignore"]);
			git(["commit", "-m", "initial"]);
			if (dirty)
				await writeFile(join(fixture.projectRoot, "dirty.txt"), "unfinished");
			const beforeNotes = "worker sentinel  \nsecond line";
			await fixture.taskManager.updateTask("TASK-1", {
				implementationNotes: beforeNotes,
			});
			const events: DriverEvent[] = [];
			const spec = createSpec(fixture);
			const prepared = await prepareTaskStep({
				fixture,
				spec,
				events,
				backendRun: async () =>
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
			});
			await (await prepared.backend.start(prepared.step)).result;
			const notes =
				(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes ??
				"";
			const ref = `refs/cosmonauts/drive/${spec.runId}/TASK-1/attempt-1`;
			expect(
				notes.startsWith(
					`${beforeNotes}\n\n### Drive — outcome ${outcome} — attempt 1 — run ${spec.runId}\n\n${dirty ? `Worktree snapshot: ${ref}\n` : ""}`,
				),
			).toBe(true);
			expect(notes.match(/### Drive — outcome /g)).toHaveLength(1);
			expect(notes.includes("Worktree snapshot:")).toBe(dirty);
			expect(
				events.find((event) => event.type === "spawn_started"),
			).toMatchObject(
				dirty ? { worktreeSnapshot: ref } : { type: "spawn_started" },
			);
		}
	});

	test.each([
		"preflight",
		"postflight",
		"during-postflight",
	] as const)("blocks a %s probe journal before verification or commit", async (phase) => {
		const fixture = await setupFixture(`probe-journal-${phase}`);
		await fixture.taskManager.createTask({ title: "Journal safety" });
		const journal = join(
			probeJournalDirectory(fixture.projectRoot),
			"journal-corrupt",
		);
		const events: DriverEvent[] = [];
		const run = vi.fn(async () => {
			if (phase === "postflight") await mkdir(journal, { recursive: true });
			return successfulBackendResult();
		});
		if (phase === "preflight") await mkdir(journal, { recursive: true });
		try {
			const spec = createSpec(fixture, {
				postflightCommands: [
					phase === "during-postflight"
						? nodeCommand(
								`require('fs').mkdirSync(${JSON.stringify(journal)}, { recursive: true })`,
							)
						: nodeCommand("process.exit(7)"),
				],
			});
			const prepared = await prepareTaskStep({
				fixture,
				spec,
				backendRun: run,
				events,
			});
			const result = await (await prepared.backend.start(prepared.step)).result;
			expect(result).toMatchObject({
				outcome: "blocked",
				summary: expect.stringContaining(`recovery-required: ${journal}`),
			});
			expect(events.some((event) => event.type === "verify")).toBe(
				phase === "during-postflight",
			);
			expect(run).toHaveBeenCalledTimes(phase === "preflight" ? 0 : 1);
			expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
				"Blocked",
			);
		} finally {
			await rm(probeJournalDirectory(fixture.projectRoot), {
				recursive: true,
				force: true,
			});
		}
	});
	test("builds BackendInvocation from scheduler input and rendered task prompts", async () => {
		const fixture = await setupFixture("prepare-authoritative");
		await fixture.taskManager.createTask({ title: "First selected task" });
		await fixture.taskManager.createTask({ title: "Remaining task" });
		const spec = createSpec(fixture, {
			runId: "run-prepare",
			taskIds: ["TASK-2"],
		});
		const backend = createDriveSchedulerBackend({
			spec,
			taskManager: fixture.taskManager,
			backend: createBackend(),
			eventSink: fixture.recordEvent,
		});
		const run = createRunRecord(spec, {
			driveTaskIds: ["TASK-1", "TASK-2"],
		});
		const step = createStepRecord(spec, "TASK-1");
		const schedulerInput = createSchedulerInput(step);
		const signal = new AbortController().signal;

		const prepared = await backend.prepare(
			step,
			createBackendContext(run, step, schedulerInput, signal),
		);

		const invocation = (
			prepared as typeof prepared & { invocation: BackendInvocation }
		).invocation;
		expect(invocation).toMatchObject({
			runId: spec.runId,
			workdir: spec.workdir,
			projectRoot: spec.projectRoot,
			taskId: "TASK-1",
			parentSessionId: spec.parentSessionId,
			planSlug: spec.planSlug,
			eventSink: fixture.recordEvent,
			signal,
		});
		expect(invocation.promptPath).toBe(
			join(spec.workdir, "prompts", "TASK-1.md"),
		);
		expect(await readFile(invocation.promptPath, "utf-8")).toContain(
			"First selected task",
		);

		await expect(
			backend.prepare(
				createStepRecord(spec, "TASK-3"),
				createBackendContext(
					run,
					createStepRecord(spec, "TASK-3"),
					createSchedulerInput(createStepRecord(spec, "TASK-3")),
					signal,
				),
			),
		).rejects.toThrow(/not in selected Drive task set/);
	});

	test.each([
		"stop",
		"continue",
	] as const)("blocks a raw outcome-line report without graph postflight or retry in %s mode", async (partialMode) => {
		const fixture = await setupFixture(`graph-blocked-${partialMode}`);
		await fixture.taskManager.createTask({ title: "Needs human" });
		await fixture.taskManager.updateTask("TASK-1", {
			implementationNotes: "original  \n",
		});
		await writeFile(join(fixture.projectRoot, "existing.txt"), "present");
		// F3, INV-002: the final blocked line governs even after an earlier success line.
		const raw =
			"outcome: success\nexisting.txt needs human input\noutcome: blocked";
		const events: DriverEvent[] = [];
		const backendRun = vi
			.fn()
			.mockResolvedValue({ exitCode: 0, stdout: raw, durationMs: 1 });
		const spec = createSpec(fixture, {
			partialMode,
			postflightCommands: [nodeCommand("process.exit(8)")],
		});
		const prepared = await prepareTaskStep({
			spec,
			fixture,
			backendRun,
			events,
		});
		const result = await (await prepared.backend.start(prepared.step)).result;
		expect(result).toMatchObject({
			outcome: "blocked",
			summary: raw,
			nextAction: "wait_for_human",
		});
		expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
			"Blocked",
		);
		const notes = (await fixture.taskManager.getTask("TASK-1"))
			?.implementationNotes;
		expect(notes).toContain(
			`original  \n\n### Drive — outcome blocked — attempt 1 — run ${spec.runId}\n\n${raw}`,
		);
		expect(notes?.match(/### Drive — outcome blocked/g)).toHaveLength(1);
		expect(events.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"task_blocked",
		]);
		expect(events.find((event) => event.type === "task_blocked")).toMatchObject(
			{ reason: raw },
		);
		expect(backendRun).toHaveBeenCalledTimes(1);
		await transitionDriveTaskStatus({
			spec,
			ctx: {
				taskManager: fixture.taskManager,
				eventSink: async (event) => {
					events.push(event);
				},
				abortSignal: new AbortController().signal,
			},
			taskId: "TASK-1",
			outcome: reportOutcomeFromStepResult(result),
			parsedReport: parsedReportFromStepResult(result),
			failureReason: raw,
		});
		expect(
			(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes,
		).toBe(notes);
		expect(
			events.filter((event) => event.type === "task_blocked"),
		).toHaveLength(1);
	});

	test("blocks fenced success conflicting with a final human stop before graph postflight or retry", async () => {
		const fixture = await setupFixture("conflicting-report");
		await fixture.taskManager.createTask({ title: "Needs human" });
		const raw =
			'```json\n{"outcome":"success","notes":"Finished"}\n```\n```json\n{"outcome":"blocked","notes":"Need approval"}\n```';
		const events: DriverEvent[] = [];
		const backendRun = vi.fn(async () => ({
			exitCode: 0,
			stdout: raw,
			durationMs: 1,
		}));
		const spec = createSpec(fixture, {
			postflightCommands: [nodeCommand("process.exit(8)")],
		});
		const prepared = await prepareTaskStep({
			spec,
			fixture,
			events,
			backendRun,
		});
		const result = await (await prepared.backend.start(prepared.step)).result;
		expect(result).toMatchObject({
			outcome: "blocked",
			summary: "Need approval",
		});
		// H1 / INV-002: graph task record names the blocked report's reason.
		expect(
			(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes,
		).toContain("Need approval");
		expect(events.map((event) => event.type)).not.toContain("verify");
		expect(events.map((event) => event.type)).not.toContain("task_retry");
		expect(backendRun).toHaveBeenCalledTimes(1);
	});

	test("records moved HEAD as unverified on a graph blocked stop", async () => {
		const fixture = await setupFixture("graph-blocked-commit");
		await fixture.taskManager.createTask({ title: "Needs human" });
		const git = (...args: string[]) =>
			execFileSync("git", args, {
				cwd: fixture.projectRoot,
				encoding: "utf-8",
			}).trim();
		git("init", "-b", "main");
		git(
			"-c",
			"user.name=Test",
			"-c",
			"user.email=test@example.com",
			"commit",
			"--allow-empty",
			"-m",
			"initial",
		);
		const before = git("rev-parse", "HEAD");
		const events: DriverEvent[] = [];
		const backendRun = vi.fn(async () => {
			git(
				"-c",
				"user.name=Test",
				"-c",
				"user.email=test@example.com",
				"commit",
				"--allow-empty",
				"-m",
				"unfinished",
			);
			return { exitCode: 0, stdout: "outcome: blocked", durationMs: 1 };
		});
		const spec = createSpec(fixture, { commitPolicy: "backend-commits" });
		const prepared = await prepareTaskStep({
			spec,
			fixture,
			backendRun,
			events,
		});
		await (await prepared.backend.start(prepared.step)).result;
		const range = `${before}..${git("rev-parse", "HEAD")}`;
		expect(
			(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes,
		).toContain(`Unverified commits: ${range}`);
		expect(events.find((event) => event.type === "task_blocked")).toMatchObject(
			{ unverifiedCommits: range },
		);
	});

	test("runs preflight backend postflight and report inference before returning StepResult", async () => {
		const inferred = await setupFixture("execution-inferred");
		await inferred.taskManager.createTask({ title: "Infer from postflight" });
		const inferredEvents: DriverEvent[] = [];
		let invocation: BackendInvocation | undefined;
		const spec = createSpec(inferred, {
			runId: "run-inferred",
			postflightCommands: [nodeCommand("process.exit(0)")],
		});
		const prepared = await prepareTaskStep({
			spec,
			fixture: inferred,
			backendRun: async (input) => {
				invocation = input;
				return {
					exitCode: 0,
					stdout: "Implemented the requested behavior without a report.",
					durationMs: 5,
				};
			},
			events: inferredEvents,
		});

		const handle = await prepared.backend.start(prepared.step);
		const result = await handle.result;

		expect(invocation?.promptPath).toBe(
			join(spec.workdir, "prompts", "TASK-1.md"),
		);
		expect(result).toMatchObject({
			outcome: "success",
			nextAction: "continue",
			verification: [{ command: expect.any(String), status: "pass" }],
		});
		expect(inferredEvents.map((event) => event.type)).toEqual([
			"task_started",
			"preflight",
			"preflight",
			"spawn_started",
			"spawn_completed",
			"verify",
			"verify",
		]);

		const blocked = await setupFixture("execution-preflight-blocked");
		await blocked.taskManager.createTask({ title: "Blocked before backend" });
		let backendWasCalled = false;
		const blockedSpec = createSpec(blocked, {
			runId: "run-preflight-blocked",
			preflightCommands: [
				nodeCommand("process.stderr.write('nope'); process.exit(7)"),
			],
		});
		const blockedPrepared = await prepareTaskStep({
			spec: blockedSpec,
			fixture: blocked,
			backendRun: async () => {
				backendWasCalled = true;
				return successfulBackendResult();
			},
			events: [],
		});

		const blockedHandle = await blockedPrepared.backend.start(
			blockedPrepared.step,
		);
		await expect(blockedHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: "nope",
		});
		expect(backendWasCalled).toBe(false);

		const unchecked = await setupFixture("execution-unchecked-ac");
		await unchecked.taskManager.createTask({
			title: "Unverified criteria",
			acceptanceCriteria: ["Verified behavior"],
		});
		const uncheckedSpec = createSpec(unchecked, {
			runId: "run-unchecked-ac",
		});
		const uncheckedPrepared = await prepareTaskStep({
			spec: uncheckedSpec,
			fixture: unchecked,
			backendRun: async () => successfulBackendResult(),
			events: [],
		});

		const uncheckedHandle = await uncheckedPrepared.backend.start(
			uncheckedPrepared.step,
		);
		await expect(uncheckedHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("acceptance criteria still unchecked"),
		});
		expect((await unchecked.taskManager.getTask("TASK-1"))?.status).toBe(
			"Blocked",
		);

		const postflight = await setupFixture("execution-postflight-blocked");
		await postflight.taskManager.createTask({ title: "Postflight blocks" });
		const postflightSpec = createSpec(postflight, {
			runId: "run-postflight-blocked",
			postflightCommands: [
				nodeCommand("process.stderr.write('verify failed'); process.exit(1)"),
			],
		});
		const postflightPrepared = await prepareTaskStep({
			spec: postflightSpec,
			fixture: postflight,
			backendRun: async () => successfulBackendResult(),
			events: [],
		});

		const postflightHandle = await postflightPrepared.backend.start(
			postflightPrepared.step,
		);
		await expect(postflightHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("post-verify failed"),
		});

		const partial = await setupFixture("execution-partial-continue");
		await partial.taskManager.createTask({ title: "Partial can continue" });
		const partialSpec = createSpec(partial, {
			runId: "run-partial-continue",
			partialMode: "continue",
		});
		const partialPrepared = await prepareTaskStep({
			spec: partialSpec,
			fixture: partial,
			backendRun: async () => partialBackendResult(),
			events: [],
		});

		const partialHandle = await partialPrepared.backend.start(
			partialPrepared.step,
		);
		await expect(partialHandle.result).resolves.toMatchObject({
			outcome: "success",
			nextAction: "continue",
			summary: expect.stringContaining("partial"),
			artifacts: expect.arrayContaining([
				expect.objectContaining({
					kind: "drive-partial-continue",
					metadata: { taskId: "TASK-1" },
				}),
			]),
		});
		expect((await partial.taskManager.getTask("TASK-1"))?.status).toBe(
			"In Progress",
		);

		const timeout = await setupFixture("execution-timeout");
		await timeout.taskManager.createTask({ title: "Timed out" });
		const timeoutSpec = createSpec(timeout, {
			runId: "run-timeout",
			taskTimeoutMs: 10,
		});
		const timeoutPrepared = await prepareTaskStep({
			spec: timeoutSpec,
			fixture: timeout,
			backendRun: async (input) =>
				new Promise((_, reject) => {
					input.signal?.addEventListener("abort", () => {
						reject(new Error("backend aborted"));
					});
				}),
			events: [],
		});

		const timeoutHandle = await timeoutPrepared.backend.start(
			timeoutPrepared.step,
		);
		await expect(timeoutHandle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: "task timed out after 10ms",
		});
	});

	test("registers only the selected drive backend with production recovery capabilities", async () => {
		const cases = [
			{
				name: "codex",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: false,
					isolatedFromHostSource: true,
					emitsMachineReport: true,
				},
			},
			{
				name: "claude-cli",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: true,
					isolatedFromHostSource: true,
					emitsMachineReport: true,
				},
			},
			{
				name: "cosmonauts-subagent",
				expected: {
					canResume: false,
					canCancel: false,
					canCommit: true,
					isolatedFromHostSource: false,
					emitsMachineReport: true,
				},
			},
		] as const;

		for (const { name, expected } of cases) {
			const fixture = await setupFixture(`map-${name}`);
			const spec = createSpec(fixture, {
				runId: `run-map-${name}`,
				backendName: name,
			});

			const backends = createDriveSchedulerBackendMap({
				spec,
				taskManager: fixture.taskManager,
				backend: createBackend({ name }),
				eventSink: fixture.recordEvent,
			});

			expect([...backends.keys()]).toEqual([name, "shell-command"]);
			expect(backends.get(name)?.capabilities).toEqual(
				DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name],
			);
			expect(backends.get(name)?.capabilities).toEqual(expected);
			expect(backends.get("shell-command")?.capabilities).toEqual({
				canResume: false,
				canCancel: false,
				canCommit: true,
				isolatedFromHostSource: false,
				emitsMachineReport: true,
			});
		}
	});

	test("retries a graph task once when a failed report contradicts an existing relative path", async () => {
		const fixture = await setupFixture("graph-contradicted-retry");
		await fixture.taskManager.createTask({
			title: "Retry contradicted block",
			description: "Use design/README.md.",
		});
		await mkdir(join(fixture.projectRoot, "design"), { recursive: true });
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"line one\nline two\n",
			"utf-8",
		);
		const events: DriverEvent[] = [];
		const backendRun = vi
			.fn()
			.mockResolvedValueOnce(
				blockedBackendResult(
					"design/README.md does not exist; confirmed via git ls-files.",
				),
			)
			.mockResolvedValueOnce(successfulBackendResult());
		const prepared = await prepareTaskStep({
			spec: createSpec(fixture, { runId: "run-graph-contradicted-retry" }),
			fixture,
			backendRun,
			events,
		});

		const handle = await prepared.backend.start(prepared.step);
		const result = await handle.result;

		expect(backendRun).toHaveBeenCalledTimes(2);
		expect(events.filter((event) => event.type === "task_retry")).toEqual([
			expect.objectContaining({
				type: "task_retry",
				trigger: "contradicted-path",
				attemptNumber: 2,
				contradicted: { path: "design/README.md", existsOnDisk: true },
			}),
		]);
		expect(
			events
				.map((event) => event.type)
				.filter((type) => type === "task_retry" || type === "spawn_started"),
		).toEqual(["spawn_started", "task_retry", "spawn_started"]);
		expect(result).toMatchObject({
			outcome: "success",
			nextAction: "continue",
		});
		expect(
			events.filter((event) => event.type === "task_blocked"),
		).toHaveLength(1);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "task_blocked",
				contradicted: { path: "design/README.md", existsOnDisk: true },
			}),
		);
		const retryPrompt = await readFile(
			join(fixture.workdir, "prompts", "TASK-1.md"),
			"utf-8",
		);
		expect(retryPrompt).toContain("Note from the driver");
		expect(retryPrompt).toContain(
			join(fixture.projectRoot, "design", "README.md"),
		);
		expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
			"In Progress",
		);
		const notes = (await fixture.taskManager.getTask("TASK-1"))
			?.implementationNotes;
		expect(notes).toContain(
			"### Drive — outcome failure — attempt 1 — run run-graph-contradicted-retry",
		);
		expect(notes?.match(/### Drive — outcome failure/g)).toHaveLength(1);
	});

	test("does not announce a graph retry when the next prompt cannot be rendered", async () => {
		const fixture = await setupFixture("retry-preparation-fails");
		await fixture.taskManager.createTask({ title: "Retry" });
		await mkdir(join(fixture.projectRoot, "design"));
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"present",
		);
		const events: DriverEvent[] = [];
		const backendRun = vi.fn(async () => {
			await rm(join(fixture.projectRoot, "envelope.md"));
			return blockedBackendResult("design/README.md does not exist");
		});
		const prepared = await prepareTaskStep({
			spec: createSpec(fixture),
			fixture,
			backendRun,
			events,
		});
		await expect(
			(await prepared.backend.start(prepared.step)).result,
		).rejects.toThrow();
		expect(events.map((event) => event.type)).not.toContain("task_retry");
		expect(backendRun).toHaveBeenCalledTimes(1);
	});

	test("orders both retry records without changing status before the second spawn", async () => {
		const fixture = await setupFixture("retry-record-order");
		await fixture.taskManager.createTask({ title: "Retry records" });
		await fixture.taskManager.updateTask("TASK-1", {
			implementationNotes: "worker sentinel  ",
		});
		await mkdir(join(fixture.projectRoot, "design"), { recursive: true });
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"exists\n",
		);
		const spec = createSpec(fixture, { runId: "run-retry-record-order" });
		let statusBeforeSecond: string | undefined;
		let calls = 0;
		const prepared = await prepareTaskStep({
			spec,
			fixture,
			events: [],
			backendRun: async () => {
				calls++;
				if (calls === 2)
					statusBeforeSecond = (await fixture.taskManager.getTask("TASK-1"))
						?.status;
				return blockedBackendResult("design/README.md does not exist");
			},
		});
		const handle = await prepared.backend.start(prepared.step);
		expect((await handle.result).outcome).toBe("blocked");
		expect(statusBeforeSecond).toBe("In Progress");
		const notes =
			(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes ?? "";
		expect(notes).toContain("worker sentinel  ");
		const first = notes.indexOf(
			"### Drive — outcome failure — attempt 1 — run run-retry-record-order",
		);
		const second = notes.indexOf(
			"### Drive — outcome failure — attempt 2 — run run-retry-record-order",
		);
		expect(first).toBeGreaterThan(-1);
		expect(second).toBeGreaterThan(first);
		expect(notes.match(/### Drive — outcome failure/g)).toHaveLength(2);
	});

	test("keeps worker notes and writes one record for a partial continue attempt", async () => {
		const fixture = await setupFixture("partial-notes");
		await fixture.taskManager.createTask({ title: "Partial work" });
		await fixture.taskManager.updateTask("TASK-1", {
			implementationNotes: "sentinel  \nworker line",
		});
		const spec = createSpec(fixture, {
			runId: "run-partial-notes",
			partialMode: "continue",
		});
		const prepared = await prepareTaskStep({
			spec,
			fixture,
			backendRun: async () => partialBackendResult(),
			events: [],
		});
		const handle = await prepared.backend.start(prepared.step);
		expect((await handle.result).outcome).toBe("success");
		const notes = (await fixture.taskManager.getTask("TASK-1"))
			?.implementationNotes;
		expect(notes).toContain("sentinel  \nworker line");
		expect(notes).toContain(
			"### Drive — outcome partial — attempt 1 — run run-partial-notes",
		);
		expect(notes?.match(/### Drive — outcome partial/g)).toHaveLength(1);
		expect(notes).not.toContain("partial: partial:");
		for (let retry = 0; retry < 2; retry++) {
			await transitionDriveTaskStatus({
				spec,
				ctx: {
					taskManager: fixture.taskManager,
					eventSink: fixture.recordEvent,
					abortSignal: new AbortController().signal,
				},
				taskId: "TASK-1",
				outcome: "partial",
				parsedReport: {
					outcome: "partial",
					files: [],
					verification: [],
					notes: "needs follow-up",
				},
				failureReason: "needs follow-up",
			});
		}
		expect(
			(await fixture.taskManager.getTask("TASK-1"))?.implementationNotes,
		).toBe(notes);
	});

	test("does not retry a contradicted graph task when retryOnContradictedBlock is false", async () => {
		const fixture = await setupFixture("graph-contradicted-retry-disabled");
		await fixture.taskManager.createTask({
			title: "Retry disabled",
			description: "Use design/README.md.",
		});
		await mkdir(join(fixture.projectRoot, "design"), { recursive: true });
		await writeFile(
			join(fixture.projectRoot, "design", "README.md"),
			"exists\n",
			"utf-8",
		);
		const events: DriverEvent[] = [];
		const backendRun = vi
			.fn()
			.mockResolvedValue(
				blockedBackendResult("design/README.md does not exist"),
			);
		const prepared = await prepareTaskStep({
			spec: createSpec(fixture, {
				runId: "run-graph-contradicted-retry-disabled",
				retryOnContradictedBlock: false,
			}),
			fixture,
			backendRun,
			events,
		});

		const handle = await prepared.backend.start(prepared.step);

		await expect(handle.result).resolves.toMatchObject({
			outcome: "blocked",
			nextAction: "wait_for_human",
			summary: expect.stringContaining("design/README.md"),
		});
		expect(backendRun).toHaveBeenCalledTimes(1);
		expect(events.filter((event) => event.type === "task_retry")).toEqual([]);
		expect(
			events.filter((event) => event.type === "task_blocked"),
		).toHaveLength(1);
		expect((await fixture.taskManager.getTask("TASK-1"))?.status).toBe(
			"Blocked",
		);
	});
});

async function prepareTaskStep(options: {
	spec: DriverRunSpec;
	fixture: Fixture;
	backendRun: (input: BackendInvocation) => Promise<BackendRunResult>;
	events: DriverEvent[];
}) {
	const bridge = createDriveSchedulerBackend({
		spec: options.spec,
		taskManager: options.fixture.taskManager,
		backend: createBackend({ run: options.backendRun }),
		eventSink: async (event) => {
			options.events.push(event);
		},
	});
	const run = createRunRecord(options.spec);
	const stepRecord = createStepRecord(options.spec, "TASK-1");
	const schedulerInput = createSchedulerInput(stepRecord);
	const preparedStep = await bridge.prepare(
		stepRecord,
		createBackendContext(
			run,
			stepRecord,
			schedulerInput,
			new AbortController().signal,
		),
	);

	return { backend: bridge, step: preparedStep };
}

interface Fixture {
	projectRoot: string;
	workdir: string;
	taskManager: TaskManager;
	recordEvent: (event: DriverEvent) => Promise<void>;
}

async function setupFixture(name: string): Promise<Fixture> {
	const projectRoot = join(temp.path, name, "project");
	const workdir = join(temp.path, name, "workdir");
	await mkdir(projectRoot, { recursive: true });
	await mkdir(workdir, { recursive: true });
	await writeFile(join(projectRoot, "envelope.md"), "# Envelope\n", "utf-8");
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init({ zeroPadding: 0 });
	return {
		projectRoot,
		workdir,
		taskManager,
		recordEvent: async () => {},
	};
}

function createSpec(
	fixture: Fixture,
	overrides: Partial<DriverRunSpec> = {},
): DriverRunSpec {
	return {
		runId: "run-drive-scheduler",
		parentSessionId: PARENT_SESSION_ID,
		projectRoot: fixture.projectRoot,
		planSlug: PLAN_SLUG,
		taskIds: ["TASK-1"],
		backendName: "codex",
		promptTemplate: { envelopePath: join(fixture.projectRoot, "envelope.md") },
		preflightCommands: [],
		postflightCommands: [],
		commitPolicy: "no-commit",
		workdir: fixture.workdir,
		eventLogPath: join(fixture.workdir, "events.jsonl"),
		...overrides,
	};
}

function createBackend(
	options: { name?: Backend["name"]; run?: Backend["run"] } = {},
): Backend {
	return {
		name: options.name ?? "codex",
		capabilities: { canCommit: false, isolatedFromHostSource: true },
		async run(invocation) {
			return options.run?.(invocation) ?? successfulBackendResult();
		},
	};
}

function successfulBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "success",
				files: [],
				verification: [],
				notes: "done",
			}),
			"```",
			"outcome: success",
		].join("\n"),
		durationMs: 1,
	};
}

function partialBackendResult(): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "partial",
				files: [],
				verification: [],
				notes: "needs follow-up",
			}),
			"```",
			"outcome: partial",
		].join("\n"),
		durationMs: 1,
	};
}

function blockedBackendResult(notes: string): BackendRunResult {
	return {
		exitCode: 0,
		stdout: [
			"```json",
			JSON.stringify({
				outcome: "failure",
				files: [],
				verification: [],
				notes,
			}),
			"```",
			"outcome: failure",
		].join("\n"),
		durationMs: 1,
	};
}

function createRunRecord(
	spec: DriverRunSpec,
	metadata: Record<string, unknown> = { driveTaskIds: spec.taskIds },
): RunRecord {
	return {
		scope: spec.planSlug,
		runId: spec.runId,
		status: "running",
		createdAt: "2026-06-04T00:00:00.000Z",
		updatedAt: "2026-06-04T00:00:00.000Z",
		runDir: spec.workdir,
		graphPath: join(spec.workdir, "graph.json"),
		eventsPath: join(spec.workdir, "orchestration-events.jsonl"),
		artifactsDir: join(spec.workdir, "artifacts"),
		schedulerStatePath: join(spec.workdir, "scheduler-state.json"),
		stepsDir: join(spec.workdir, "steps"),
		policy: {
			reportInference: "objective",
			defaultBackend: { name: spec.backendName },
			worktree: { mode: "shared", path: spec.workdir },
		},
		metadata,
	};
}

function createStepRecord(spec: DriverRunSpec, taskId: string): StepRecord {
	return {
		id: taskId,
		runId: spec.runId,
		title: `Drive task ${taskId}`,
		kind: "drive",
		backend: { name: spec.backendName },
		dependsOn: [],
		status: "ready",
		inputArtifacts: [
			{ id: "task", path: `missions/tasks/${taskId}.md`, kind: "task" },
			{ id: "prompt", path: `prompts/${taskId}.md`, kind: "prompt" },
		],
		outputArtifacts: [],
	};
}

function createSchedulerInput(step: StepRecord): SchedulerStepInput {
	return {
		runId: step.runId,
		stepId: step.id,
		inputArtifacts: step.inputArtifacts,
		backendOptions: step.backend.options,
	};
}

function createBackendContext(
	run: RunRecord,
	step: StepRecord,
	input: SchedulerStepInput,
	signal: AbortSignal,
): BackendContext<SchedulerStepInput> {
	return {
		run,
		step,
		input,
		signal,
		attemptId: "attempt-001",
		now: () => "2026-06-04T00:00:00.000Z",
	};
}

function nodeCommand(script: string): string {
	return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}
