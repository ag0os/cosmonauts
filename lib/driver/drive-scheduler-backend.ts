import { spawn } from "node:child_process";
import type {
	ArtifactRef,
	BackendContext,
	BackendHandle,
	BackendSpec,
	KnownBackendName,
	PreparedStep,
	RunGraphSchedulerBackend,
	SchedulerStepInput,
	StepRecord,
	StepResult,
	VerificationResult,
} from "../durable-runtime/index.ts";
import type { TaskManager } from "../tasks/task-manager.ts";
import { DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES } from "./backends/orchestration-adapter.ts";
import type {
	Backend,
	BackendInvocation,
	BackendRunResult,
} from "./backends/types.ts";
import { renderPromptForTask } from "./prompt-template.ts";
import { parseReport } from "./report-parser.ts";
import {
	canInferUnknownSuccess,
	DEFAULT_TASK_TIMEOUT_MS,
	deriveFailureReason,
	deriveOutcome,
	type PostVerifyResult,
	partialReason,
	type RunOneTaskCtx,
} from "./run-one-task.ts";
import { createDriveShellCommandBackend } from "./shell-command-finalizer.ts";
import {
	type DriverEvent,
	type DriverRunSpec,
	type EventSink,
	type ParsedReport,
	type PromptLayers,
	type Report,
	resolveStateCommitPolicy,
} from "./types.ts";

export interface DriveSchedulerBackendContext {
	spec: DriverRunSpec;
	taskManager: TaskManager;
	backend: Backend;
	eventSink: EventSink;
}

interface DrivePreparedStep extends PreparedStep<SchedulerStepInput> {
	invocation: BackendInvocation;
	taskId: string;
	abortSignal: AbortSignal;
}

type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface SpawnSuccess {
	status: "success";
	result: BackendRunResult;
}

interface SpawnFailure {
	status: "failure";
	error: string;
	exitCode?: number;
}

const DRIVE_TASK_OUTPUT_ARTIFACT_KIND = "drive-task-output";

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir: string;
}

export function createDriveSchedulerBackend(
	context: DriveSchedulerBackendContext,
): RunGraphSchedulerBackend {
	const name = context.spec.backendName;
	const backendSpec: BackendSpec = { name };

	return {
		name,
		capabilities: {
			...DRIVE_BACKEND_ORCHESTRATION_CAPABILITIES[name],
		},
		async prepare(step, backendContext) {
			validateDriveTaskStep(step, context.spec, backendContext);
			const taskId = step.id;
			const promptLayers: PromptLayersWithWorkdir = {
				...context.spec.promptTemplate,
				workdir: context.spec.workdir,
			};
			const promptPath = await renderPromptForTask(
				taskId,
				promptLayers,
				context.taskManager,
				{
					runExpectations: {
						backendName: context.spec.backendName,
						commitPolicy: context.spec.commitPolicy,
						stateCommitPolicy: resolveStateCommitPolicy(context.spec),
						preflightCommands: context.spec.preflightCommands,
						postflightCommands: context.spec.postflightCommands,
						projectRoot: context.spec.projectRoot,
						workdir: context.spec.workdir,
						branch: context.spec.branch,
					},
				},
			);

			return {
				step,
				attemptId: backendContext.attemptId,
				backend: backendSpec,
				input: backendContext.input,
				preparedAt: backendContext.now?.() ?? new Date().toISOString(),
				taskId,
				abortSignal: backendContext.signal ?? new AbortController().signal,
				invocation: {
					runId: backendContext.input.runId,
					promptPath,
					workdir: context.spec.workdir,
					projectRoot: context.spec.projectRoot,
					taskId,
					parentSessionId: context.spec.parentSessionId,
					planSlug: context.spec.planSlug,
					eventSink: context.eventSink,
					signal: backendContext.signal,
				},
			} satisfies DrivePreparedStep;
		},
		async start(prepared) {
			const drivePrepared = toDrivePreparedStep(prepared);
			return {
				backend: prepared.backend,
				stepId: prepared.step.id,
				attemptId: prepared.attemptId,
				startedAt: new Date().toISOString(),
				result: runDriveTaskStep(context, drivePrepared),
			} satisfies BackendHandle<StepResult>;
		},
	};
}

export function createDriveSchedulerBackendMap(
	context: DriveSchedulerBackendContext,
): ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend> {
	return new Map<KnownBackendName, RunGraphSchedulerBackend>([
		[context.spec.backendName, createDriveSchedulerBackend(context)],
		["shell-command", createDriveShellCommandBackend(context)],
	]);
}

async function runDriveTaskStep(
	context: DriveSchedulerBackendContext,
	prepared: DrivePreparedStep,
): Promise<StepResult> {
	const { spec, taskManager } = context;
	const taskId = prepared.taskId;
	await emit(context, { type: "task_started", taskId });

	const preflight = await runPreflight(context, taskId, prepared.abortSignal);
	if (!preflight.passed) {
		return blockedStepResult(preflight.reason);
	}

	await taskManager.updateTask(taskId, { status: "In Progress" });
	await emit(context, {
		type: "spawn_started",
		taskId,
		backend: context.backend.name,
	});

	const spawnResult = await runBackendWithTimeout(
		context.backend,
		prepared.invocation,
		spec.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS,
		prepared.abortSignal,
	);
	if (spawnResult.status === "failure") {
		await emit(context, {
			type: "spawn_failed",
			taskId,
			error: spawnResult.error,
			exitCode: spawnResult.exitCode,
		});
		await blockTask(context, taskId, spawnResult.error);
		return blockedStepResult(spawnResult.error);
	}
	if (spawnResult.result.exitCode !== 0) {
		const reason = `spawn failed with exit code ${spawnResult.result.exitCode}`;
		await emit(context, {
			type: "spawn_failed",
			taskId,
			error: reason,
			exitCode: spawnResult.result.exitCode,
		});
		await blockTask(context, taskId, reason);
		return blockedStepResult(reason);
	}

	const parsedReport = parseReport(spawnResult.result.stdout);
	await emit(context, {
		type: "spawn_completed",
		taskId,
		report: parsedReport,
	});

	const postVerifyResults = await runPostVerify(
		context,
		taskId,
		prepared.abortSignal,
	);
	const allowUnknownSuccess = await canInferUnknownSuccess(
		spec,
		toRunOneTaskCtx(context, prepared.abortSignal),
		parsedReport,
		postVerifyResults,
	);
	const reportOutcome = deriveOutcome(parsedReport, postVerifyResults, {
		allowUnknownSuccess,
	});
	const uncheckedAcceptanceCriteriaReason =
		reportOutcome === "success"
			? await findUncheckedAcceptanceCriteriaReason(taskManager, taskId)
			: undefined;
	const effectiveOutcome = uncheckedAcceptanceCriteriaReason
		? "failure"
		: reportOutcome;
	const effectiveReport =
		parsedReport.outcome === "unknown" && reportOutcome === "success"
			? inferredSuccessReport(parsedReport, postVerifyResults)
			: parsedReport;
	const failureReason =
		uncheckedAcceptanceCriteriaReason ??
		deriveFailureReason(effectiveReport, postVerifyResults);

	if (effectiveOutcome === "success") {
		return successStepResult(taskId, prepared.attemptId, effectiveReport);
	}

	if (effectiveOutcome === "partial") {
		const reason = partialReason(effectiveReport);
		await taskManager.updateTask(taskId, {
			status: "In Progress",
			implementationNotes: reason,
		});
		await emit(context, {
			type: "task_blocked",
			taskId,
			reason,
			progress: reportProgress(effectiveReport),
		});
		return spec.partialMode === "continue"
			? partialContinueStepResult(taskId, prepared.attemptId, reason)
			: partialBlockedStepResult(taskId, prepared.attemptId, reason);
	}

	await blockTask(context, taskId, failureReason);
	return blockedStepResult(
		failureReason,
		outputArtifacts(taskId, prepared.attemptId),
	);
}

function validateDriveTaskStep(
	step: StepRecord,
	spec: DriverRunSpec,
	context: BackendContext<SchedulerStepInput>,
): void {
	if (step.kind !== "drive") {
		throw new Error(
			`Drive scheduler backend cannot prepare ${step.kind} step ${step.id}.`,
		);
	}
	if (context.input.stepId !== step.id) {
		throw new Error(
			`Scheduler step input ${context.input.stepId} does not match step ${step.id}.`,
		);
	}
	if (step.backend.name !== spec.backendName) {
		throw new Error(
			`Drive step ${step.id} uses backend ${step.backend.name}; expected ${spec.backendName}.`,
		);
	}
	const selectedTaskIds = authoritativeDriveTaskIds(context.run.metadata, spec);
	if (!selectedTaskIds.includes(step.id)) {
		throw new Error(
			`Drive task step ${step.id} is not in selected Drive task set.`,
		);
	}
}

function authoritativeDriveTaskIds(
	metadata: Record<string, unknown> | undefined,
	spec: DriverRunSpec,
): readonly string[] {
	const value = metadata?.driveTaskIds;
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return value;
	}
	return spec.taskIds;
}

function toDrivePreparedStep(
	prepared: PreparedStep<SchedulerStepInput>,
): DrivePreparedStep {
	if (!("invocation" in prepared)) {
		throw new Error(
			"Drive scheduler prepared step is missing BackendInvocation.",
		);
	}
	return prepared as DrivePreparedStep;
}

async function runPreflight(
	context: DriveSchedulerBackendContext,
	taskId: string,
	signal: AbortSignal,
): Promise<{ passed: true } | { passed: false; reason: string }> {
	const { spec } = context;
	await emit(context, { type: "preflight", taskId, status: "started" });

	if (spec.branch) {
		const branch = await runCommand(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			spec.projectRoot,
			signal,
		);
		if (branch.exitCode !== 0) {
			const reason = branch.stderr || "failed to determine git branch";
			await emit(context, {
				type: "preflight",
				taskId,
				status: "failed",
				details: {
					command: "git rev-parse --abbrev-ref HEAD",
					stderr: reason,
				},
			});
			return { passed: false, reason };
		}

		const actualBranch = branch.stdout.trim();
		if (actualBranch !== spec.branch) {
			const reason = `branch mismatch: expected ${spec.branch}, got ${actualBranch}`;
			await emit(context, {
				type: "preflight",
				taskId,
				status: "failed",
				details: { branch: actualBranch, stderr: reason },
			});
			return { passed: false, reason };
		}
	}

	for (const command of spec.preflightCommands) {
		const result = await runShellCommand(command, spec.projectRoot, signal);
		if (result.exitCode !== 0) {
			const reason = result.stderr || `preflight failed: ${command}`;
			await emit(context, {
				type: "preflight",
				taskId,
				status: "failed",
				details: { command, stderr: reason },
			});
			return { passed: false, reason };
		}
	}

	await emit(context, { type: "preflight", taskId, status: "passed" });
	return { passed: true };
}

async function runPostVerify(
	context: DriveSchedulerBackendContext,
	taskId: string,
	signal: AbortSignal,
): Promise<PostVerifyResult[]> {
	const results: PostVerifyResult[] = [];
	for (const command of context.spec.postflightCommands) {
		await emit(context, {
			type: "verify",
			taskId,
			phase: "post",
			status: "started",
			details: { command },
		});
		const result = await runShellCommand(
			command,
			context.spec.projectRoot,
			signal,
		);
		if (result.exitCode === 0) {
			results.push({ command, status: "pass" });
			await emit(context, {
				type: "verify",
				taskId,
				phase: "post",
				status: "passed",
				details: { command },
			});
			continue;
		}

		const stderr = result.stderr || `post-verify failed: ${command}`;
		results.push({ command, status: "fail", stderr });
		await emit(context, {
			type: "verify",
			taskId,
			phase: "post",
			status: "failed",
			details: { command, stderr },
		});
	}
	return results;
}

function runBackendWithTimeout(
	backend: Backend,
	invocation: BackendInvocation,
	timeoutMs: number,
	parentSignal: AbortSignal,
): Promise<SpawnSuccess | SpawnFailure> {
	const controller = new AbortController();
	let timedOut = false;
	let timeout: NodeJS.Timeout | undefined;

	const abortFromParent = () => controller.abort(parentSignal.reason);
	if (parentSignal.aborted) {
		abortFromParent();
	} else {
		parentSignal.addEventListener("abort", abortFromParent, { once: true });
	}

	const timeoutPromise = new Promise<SpawnFailure>((resolve) => {
		timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
			resolve({
				status: "failure",
				error: `task timed out after ${timeoutMs}ms`,
				exitCode: 124,
			});
		}, timeoutMs);
	});

	const runPromise: Promise<SpawnSuccess | SpawnFailure> = backend
		.run({ ...invocation, signal: controller.signal })
		.then(
			(result): SpawnSuccess => ({ status: "success", result }),
			(error: unknown): SpawnFailure => ({
				status: "failure",
				error: formatError(error),
				exitCode: timedOut ? 124 : undefined,
			}),
		);

	return Promise.race([runPromise, timeoutPromise]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
		parentSignal.removeEventListener("abort", abortFromParent);
	});
}

async function findUncheckedAcceptanceCriteriaReason(
	taskManager: TaskManager,
	taskId: string,
): Promise<string | undefined> {
	const task = await taskManager.getTask(taskId);
	if (!task) {
		return `task not found during acceptance-criteria verification: ${taskId}`;
	}

	const unchecked = task.acceptanceCriteria.filter(
		(criterion) => !criterion.checked,
	);
	if (unchecked.length === 0) {
		return undefined;
	}

	const ids = unchecked.map((criterion) => `#${criterion.index}`).join(", ");
	return `acceptance criteria still unchecked: ${ids}`;
}

async function blockTask(
	context: DriveSchedulerBackendContext,
	taskId: string,
	reason: string,
): Promise<void> {
	await context.taskManager.updateTask(taskId, {
		status: "Blocked",
		implementationNotes: reason,
	});
	await emit(context, { type: "task_blocked", taskId, reason });
}

function successStepResult(
	taskId: string,
	attemptId: string,
	report: ParsedReport,
): StepResult {
	if (report.outcome === "unknown") {
		return {
			outcome: "success",
			summary: "Outcome inferred from passing postflight.",
			artifacts: outputArtifacts(taskId, attemptId),
			nextAction: "continue",
		};
	}
	return {
		outcome: "success",
		summary: report.notes?.trim() || "Drive task completed.",
		artifacts: outputArtifacts(taskId, attemptId),
		files: report.files.map(fileChangeSummary),
		verification: report.verification.map(verificationResult),
		nextAction: "continue",
	};
}

function partialContinueStepResult(
	taskId: string,
	attemptId: string,
	reason: string,
): StepResult {
	return {
		outcome: "success",
		summary: reason,
		artifacts: outputArtifacts(taskId, attemptId),
		nextAction: "continue",
	};
}

function partialBlockedStepResult(
	taskId: string,
	attemptId: string,
	reason: string,
): StepResult {
	return {
		outcome: "partial",
		summary: reason,
		artifacts: outputArtifacts(taskId, attemptId),
		nextAction: "wait_for_human",
	};
}

function blockedStepResult(
	reason: string,
	artifacts: ArtifactRef[] = [],
): StepResult {
	return {
		outcome: "blocked",
		summary: reason,
		artifacts,
		nextAction: "wait_for_human",
	};
}

function outputArtifacts(taskId: string, attemptId: string): ArtifactRef[] {
	return [
		{
			id: `drive-output:${taskId}:${attemptId}`,
			path: `steps/${taskId}/attempts/${attemptId}.json`,
			kind: DRIVE_TASK_OUTPUT_ARTIFACT_KIND,
		},
	];
}

function inferredSuccessReport(
	report: Extract<ParsedReport, { outcome: "unknown" }>,
	postVerifyResults: readonly PostVerifyResult[],
): Report {
	const summary =
		report.raw
			.split(/\r?\n/)
			.map((item) => item.trim())
			.find((item) => item.length > 0) ?? "unstructured worker report";
	return {
		outcome: "success",
		files: [],
		verification: postVerifyResults.map((result) => ({
			command: result.command,
			status: result.status,
		})),
		notes: `${summary.slice(0, 80)}\n\nOutcome inferred from passing postflight because the worker emitted an unstructured report.`,
	};
}

function reportProgress(report: ParsedReport): Report["progress"] | undefined {
	return report.outcome === "partial" ? report.progress : undefined;
}

function fileChangeSummary(file: Report["files"][number]) {
	return {
		path: file.path,
		status: file.change === "created" ? ("added" as const) : file.change,
	};
}

function verificationResult(
	result: Report["verification"][number],
): VerificationResult {
	return {
		command: result.command,
		status: result.status === "not_run" ? "skipped" : result.status,
	};
}

function toRunOneTaskCtx(
	context: DriveSchedulerBackendContext,
	abortSignal: AbortSignal,
): RunOneTaskCtx {
	return {
		taskManager: context.taskManager,
		backend: context.backend,
		eventSink: context.eventSink,
		parentSessionId: context.spec.parentSessionId,
		runId: context.spec.runId,
		abortSignal,
		cosmonautsRoot: context.spec.projectRoot,
	};
}

function runShellCommand(
	command: string,
	cwd: string,
	signal: AbortSignal,
): Promise<CommandResult> {
	return runCommand(command, [], cwd, signal, true);
}

function runCommand(
	command: string,
	args: string[],
	cwd: string,
	signal: AbortSignal,
	shell = false,
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell,
			signal,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];

		child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", (error) => {
			if ((error as NodeJS.ErrnoException).name === "AbortError") {
				resolve({
					exitCode: 124,
					stdout: Buffer.concat(stdout).toString(),
					stderr: Buffer.concat(stderr).toString() || formatError(error),
				});
				return;
			}
			reject(error);
		});
		child.on("close", (code) => {
			resolve({
				exitCode: code ?? 1,
				stdout: Buffer.concat(stdout).toString(),
				stderr: Buffer.concat(stderr).toString(),
			});
		});
	});
}

async function emit(
	context: DriveSchedulerBackendContext,
	event: DriverEventInput,
): Promise<void> {
	await context.eventSink({
		...event,
		runId: context.spec.runId,
		parentSessionId: context.spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
