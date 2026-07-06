import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Command } from "commander";
import { resolveConfiguredExternalBackend } from "../../lib/driver/backend-resolution.ts";
import { createCosmonautsSubagentBackend } from "../../lib/driver/backends/cosmonauts-subagent.ts";
import type { Backend } from "../../lib/driver/backends/types.ts";
import { resolveDefaultDriveEnvelopePath } from "../../lib/driver/default-envelope.ts";
import type { startDetached } from "../../lib/driver/driver.ts";
import { launchDetached, runInline } from "../../lib/driver/driver.ts";
import { recordDurableFinalizerRetryFailure } from "../../lib/driver/durable-steps.ts";
import { formatError } from "../../lib/driver/errors.ts";
import type {
	DriverActivityBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import {
	createEventSink,
	driveDurableEventSinkOptions,
} from "../../lib/driver/event-stream.ts";
import {
	acquireRepoCommitLock,
	isProcessAlive,
} from "../../lib/driver/lock.ts";
import { DEFAULT_TASK_TIMEOUT_MS } from "../../lib/driver/run-one-task.ts";
import {
	clearPendingFinalization,
	DETACHED_RUN_PID_FILENAME,
	INLINE_RUN_STATE_FILENAME,
	type InlineRunState,
	RUN_COMPLETION_FILENAME,
	readPendingFinalization,
	writeInlineRunState,
	writeRunCompletion,
} from "../../lib/driver/run-state.ts";
import { commitFinalState } from "../../lib/driver/state-commit.ts";
import { listPendingPlanTaskIds } from "../../lib/driver/task-selection.ts";
import {
	type BackendName,
	DETACHED_DEFAULT_TASK_THRESHOLD,
	type DriverEvent,
	type DriverResult,
	type DriverRunSpec,
	type PromptLayers,
	type StateCommitPolicy,
	validateDriverPlanSlug,
} from "../../lib/driver/types.ts";
import { writeDriverWorkdirInputs } from "../../lib/driver/workdir-inputs.ts";
import { FileRunStore } from "../../lib/durable-runtime/index.ts";
import { activityBus } from "../../lib/orchestration/activity-bus.ts";
import { createPiSpawner } from "../../lib/orchestration/agent-spawner.ts";
import { discoverFrameworkBundledPackageDirs } from "../../lib/packages/dev-bundled.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

type DriverMode = "inline" | "detached";

interface DriveRunOptions {
	plan: string;
	taskIds?: string;
	backend?: BackendName;
	mode?: DriverMode;
	branch?: string;
	commitPolicy?: DriverRunSpec["commitPolicy"];
	stateCommitPolicy?: StateCommitPolicy;
	envelope?: string;
	precondition?: string;
	overrides?: string;
	maxCost?: number;
	maxTasks?: number;
	taskTimeout?: number;
	resume?: string;
	resumeDirty?: boolean;
}

interface ResumeDefaults {
	spec: DriverRunSpec;
	originalTaskIds: string[];
	remainingTaskIds: string[];
	pendingFinalization?: Awaited<ReturnType<typeof readPendingFinalization>>;
}

interface JsonError {
	error: string;
	[key: string]: unknown;
}

interface DriveStatusOptions {
	plan?: string;
}

type DriverRunDeps = Parameters<typeof startDetached>[1];

interface RunPidFile {
	pid: number;
	startedAt: string;
	runArgv?: string[];
	cosmonautsPath?: string;
}

type RunStatus =
	| DriverResult["outcome"]
	| "failed"
	| "dead"
	| "running"
	| "orphaned";
type DriverEventInput = DriverEvent extends infer Event
	? Event extends DriverEvent
		? Omit<Event, "runId" | "parentSessionId" | "timestamp">
		: never
	: never;

interface RunStatusRecord {
	runId: string;
	planSlug: string;
	status: RunStatus;
	workdir: string;
	mode?: DriverMode;
	pid?: number;
	startedAt?: string;
	lastEventAt?: string;
	result?: DriverResult;
}

interface RunDir {
	runId: string;
	planSlug: string;
	workdir: string;
}

const BACKENDS: readonly BackendName[] = [
	"codex",
	"claude-cli",
	"cosmonauts-subagent",
];
const MODES: readonly DriverMode[] = ["inline", "detached"];
const COMMIT_POLICIES: readonly DriverRunSpec["commitPolicy"][] = [
	"driver-commits",
	"backend-commits",
	"no-commit",
];
const STATE_COMMIT_POLICIES: readonly StateCommitPolicy[] = [
	"none",
	"final-state-commit",
];
const PROCESS_START_TOLERANCE_MS = 5_000;
const SOURCE_COMMIT_EXCLUDED_PATHS = [
	":(exclude)missions",
	":(exclude)missions/**",
	":(exclude)memory",
	":(exclude)memory/**",
	":(exclude).cosmonauts/*.lock",
];
const execFileAsync = promisify(execFile);

export function createDriveCompatProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts run drive compat")
		.description("Internal Drive compatibility command")
		.version("1.0.0");

	const run = program
		.command("run", { isDefault: true })
		.description("Start a Drive run");
	configureRunCommand(run);

	program
		.command("status <runId>")
		.description("Report a Drive run status")
		.option("--plan <slug>", "Plan slug containing the run")
		.action(async (runId: string, options: DriveStatusOptions) => {
			await reportDriveStatus(runId, options);
		});

	program
		.command("list")
		.description("List driver runs")
		.action(async () => {
			await listDriveRuns();
		});

	return program;
}

export function createDriveRunCommand(): Command {
	const command = new Command("drive");
	command.description("Start a Drive run");
	configureRunCommand(command);
	return command;
}

function configureRunCommand(command: Command): void {
	command
		.description(
			"Start a Drive run. Detached mode starts background Drive work and returns after launching. The launcher returning is not the run completing; poll with: cosmonauts run status <runId>",
		)
		.requiredOption("--plan <slug>", "Plan slug to run")
		.option("--task-ids <id1,id2,...>", "Comma-separated task IDs to run")
		.option(
			"--backend <backend>",
			"Driver backend: codex, claude-cli, or cosmonauts-subagent (codex/claude detached backends default to permission-bypassing modes)",
			parseBackendName,
		)
		.option("--mode <mode>", "Driver mode: inline or detached", parseDriverMode)
		.option("--branch <name>", "Expected branch for driver commits")
		.option(
			"--commit-policy <policy>",
			"Commit policy: driver-commits, backend-commits, or no-commit",
			parseCommitPolicy,
		)
		.option(
			"--state-commit-policy <policy>",
			"State commit policy: final-state-commit or none",
			parseStateCommitPolicy,
		)
		.option(
			"--envelope <path>",
			"Prompt envelope path (omit for the framework default Drive envelope)",
		)
		.option("--precondition <path>", "Prompt precondition path")
		.option("--overrides <dir>", "Per-task prompt override directory")
		.option(
			"--max-cost <usd>",
			"Accepted for future driver budget support",
			parsePositiveNumber,
		)
		.option("--max-tasks <n>", "Limit the resolved task list", parsePositiveInt)
		.option(
			"--task-timeout <ms>",
			`Per-task timeout in milliseconds (default: ${DEFAULT_TASK_TIMEOUT_MS}ms / 30 minutes)`,
			parsePositiveInt,
		)
		.option("--resume <runId>", "Resume a previous run ID")
		.option("--resume-dirty", "Allow resume with a dirty git worktree")
		.action(async () => {
			await runDrive(command.opts<DriveRunOptions>());
		});
}

// fallow-ignore-next-line complexity: CLI compatibility flow intentionally keeps legacy option ordering in one command handler.
async function runDrive(options: DriveRunOptions): Promise<void> {
	if (!options.plan) {
		throw new Error("Missing required option '--plan <slug>'");
	}
	validateDriverPlanSlug(options.plan);

	const projectRoot = process.cwd();
	const planSlug = options.plan;
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();

	const resume = options.resume
		? await loadResumeDefaults(projectRoot, planSlug, options.resume)
		: undefined;
	if (!(await prepareResume(resume, taskManager))) {
		return;
	}
	if (await refuseDirtyResume({ resume, options, projectRoot, planSlug })) {
		return;
	}

	const taskIds = await resolveTaskIds(taskManager, planSlug, options, resume);
	const mode =
		options.mode ??
		(resumeModeTaskIds(resume, taskIds).length >=
		DETACHED_DEFAULT_TASK_THRESHOLD
			? "detached"
			: "inline");
	const backendName = options.backend ?? resume?.spec.backendName ?? "codex";

	if (refuseUnsupportedDetachedBackend(mode, backendName)) {
		return;
	}

	const spec = await createRunSpec({
		projectRoot,
		planSlug,
		taskIds,
		options,
		resume,
		backendName,
	});
	const backend = await createBackend(backendName, mode, projectRoot);
	const deps = {
		taskManager,
		backend,
		activityBus,
		cosmonautsRoot: projectRoot,
	};

	if (mode === "detached") {
		await runDetached(spec, deps);
		return;
	}

	await runInlineMode(spec, deps);
}

async function prepareResume(
	resume: ResumeDefaults | undefined,
	taskManager: TaskManager,
): Promise<boolean> {
	if (!resume) {
		return true;
	}

	let retriedPendingFinalization = false;
	const pendingFinalization = resume.pendingFinalization;
	if (resume.pendingFinalization) {
		const finalized = await retryPendingFinalization(resume, taskManager);
		if (!finalized) {
			process.exitCode = 1;
			return false;
		}
		retriedPendingFinalization = true;
	}

	const shouldContinue =
		resume.remainingTaskIds.length > 0 || (await hasGraphResumeState(resume));
	if (shouldContinue) {
		await clearRunCompletion(resume.spec.workdir);
	}
	if (!shouldContinue && retriedPendingFinalization && pendingFinalization) {
		const completion = await legacyPendingFinalizationCompletion(
			resume,
			pendingFinalization,
		);
		await writeRunCompletion(resume.spec.workdir, completion);
		printJsonStdout(withDriveScope(completion, resume.spec.planSlug));
	}
	return shouldContinue;
}

async function refuseDirtyResume({
	resume,
	options,
	projectRoot,
	planSlug,
}: {
	resume: ResumeDefaults | undefined;
	options: DriveRunOptions;
	projectRoot: string;
	planSlug: string;
}): Promise<boolean> {
	if (!resume || options.resumeDirty) {
		return false;
	}

	const dirtyPaths = await getDirtyPaths(projectRoot);
	if (dirtyPaths.length === 0) {
		return false;
	}

	printJsonStderr({
		error: "dirty_worktree",
		runId: options.resume,
		planSlug,
		dirtyPaths,
		message:
			"Refusing to resume with a dirty worktree. Pass --resume-dirty to override.",
	});
	process.exitCode = 1;
	return true;
}

function refuseUnsupportedDetachedBackend(
	mode: DriverMode,
	backendName: BackendName,
): boolean {
	if (mode !== "detached" || backendName !== "cosmonauts-subagent") {
		return false;
	}

	printJsonStderr({
		error: "detached_backend_not_supported",
		backend: backendName,
		mode,
		message: "Backend cosmonauts-subagent is not supported for detached mode.",
	});
	process.exitCode = 1;
	return true;
}

async function runDetached(
	spec: DriverRunSpec,
	deps: DriverRunDeps,
): Promise<void> {
	const handle = await launchDetached(spec, deps);
	process.stdout.write(`${formatDetachedStartLine(handle.runId)}\n`);
	printJsonStdout({
		runId: handle.runId,
		scope: handle.planSlug,
		planSlug: handle.planSlug,
		workdir: handle.workdir,
		eventLogPath: handle.eventLogPath,
	});
}

function formatDetachedStartLine(runId: string): string {
	return `Drive run started: ${runId} - poll with: cosmonauts run status ${runId}`;
}

async function runInlineMode(
	spec: DriverRunSpec,
	deps: DriverRunDeps,
): Promise<void> {
	await prepareInlineWorkdir(spec);
	const unsubscribe = subscribeToRunEvents(spec.runId);
	try {
		const handle = runInline(spec, deps);
		const result = await handle.result.catch(async (error: unknown) => {
			await writeRunCompletion(spec.workdir, abortedCompletion(spec, error));
			throw error;
		});
		if (!existsSync(join(spec.workdir, RUN_COMPLETION_FILENAME))) {
			await writeRunCompletion(spec.workdir, result);
		}
		printJsonStdout(withDriveScope(result, spec.planSlug));
		process.exitCode = result.outcome === "completed" ? 0 : 1;
	} finally {
		unsubscribe();
	}
}

function withDriveScope<T extends object>(
	value: T,
	planSlug: string,
): T & { scope: string } {
	return { ...value, scope: planSlug };
}

async function reportDriveStatus(
	runId: string,
	options: DriveStatusOptions,
): Promise<void> {
	const projectRoot = process.cwd();
	const runDir = options.plan
		? {
				runId,
				planSlug: options.plan,
				workdir: runWorkdir(projectRoot, options.plan, runId),
			}
		: await findUniqueRunDir(projectRoot, runId);

	if (!runDir) {
		process.exitCode = 1;
		return;
	}

	const record = await classifyRunDir(runDir);
	if (!record) {
		printJsonStderr({
			error: "run_state_not_found",
			runId,
			planSlug: runDir.planSlug,
			workdir: runDir.workdir,
			message:
				"Run directory has none of run.completion.json, run.pid, or run.inline.json.",
		});
		process.exitCode = 1;
		return;
	}

	printJsonStdout(record);
}

async function listDriveRuns(): Promise<void> {
	const runDirs = await findRunDirsWithState(process.cwd());
	const runs: RunStatusRecord[] = [];
	for (const runDir of runDirs) {
		const record = await classifyRunDir(runDir);
		if (record) {
			runs.push(record);
		}
	}
	printJsonStdout({ runs });
}

async function findUniqueRunDir(
	projectRoot: string,
	runId: string,
): Promise<RunDir | undefined> {
	const runDirs = await findRunDirs(projectRoot, runId);
	if (runDirs.length === 1) {
		return runDirs[0];
	}
	if (runDirs.length === 0) {
		printJsonStderr({
			error: "run_not_found",
			runId,
			message:
				"No matching run directory found. Pass --plan <slug> to select a plan.",
		});
	} else {
		printJsonStderr({
			error: "ambiguous_run_id",
			runId,
			matches: runDirs.map(({ planSlug, workdir }) => ({ planSlug, workdir })),
			message:
				"Multiple matching run directories found. Pass --plan <slug> to select one.",
		});
	}
	return undefined;
}

async function findRunDirs(
	projectRoot: string,
	runIdFilter?: string,
): Promise<RunDir[]> {
	const sessionsDir = join(projectRoot, "missions", "sessions");
	const plans = await readDirectoryEntries(sessionsDir);
	const runDirs: RunDir[] = [];

	for (const plan of plans) {
		if (!plan.isDirectory()) {
			continue;
		}
		const planSlug = plan.name;
		const runsDir = join(sessionsDir, planSlug, "runs");
		const runs = await readDirectoryEntries(runsDir);
		for (const run of runs) {
			if (!run.isDirectory()) {
				continue;
			}
			if (runIdFilter && run.name !== runIdFilter) {
				continue;
			}
			runDirs.push({
				runId: run.name,
				planSlug,
				workdir: join(runsDir, run.name),
			});
		}
	}

	return runDirs.sort((a, b) =>
		a.planSlug === b.planSlug
			? a.runId.localeCompare(b.runId)
			: a.planSlug.localeCompare(b.planSlug),
	);
}

async function findRunDirsWithState(projectRoot: string): Promise<RunDir[]> {
	const runDirs = await findRunDirs(projectRoot);
	const stateful: RunDir[] = [];
	for (const runDir of runDirs) {
		if (await hasRunState(runDir.workdir)) {
			stateful.push(runDir);
		}
	}
	return stateful;
}

async function hasRunState(workdir: string): Promise<boolean> {
	return (
		(await fileExists(join(workdir, RUN_COMPLETION_FILENAME))) ||
		(await fileExists(join(workdir, DETACHED_RUN_PID_FILENAME))) ||
		(await fileExists(join(workdir, INLINE_RUN_STATE_FILENAME)))
	);
}

async function classifyRunDir(
	runDir: RunDir,
): Promise<RunStatusRecord | undefined> {
	const result = await readCompletion(runDir.workdir);
	if (result) {
		return {
			runId: runDir.runId,
			planSlug: runDir.planSlug,
			status: result.outcome,
			workdir: runDir.workdir,
			lastEventAt: await readLastEventAt(runDir.workdir),
			result,
		};
	}

	const pidFile = await readRunPid(runDir.workdir);
	if (pidFile) {
		const status =
			(await readLastTerminalEventStatus(runDir.workdir)) ??
			(await classifyPidStatus(pidFile));
		return {
			runId: runDir.runId,
			planSlug: runDir.planSlug,
			status,
			workdir: runDir.workdir,
			mode: "detached",
			pid: pidFile.pid,
			startedAt: pidFile.startedAt,
			lastEventAt: await readLastEventAt(runDir.workdir),
		};
	}

	const inlineState = await readInlineRunState(runDir.workdir);
	if (!inlineState) {
		return undefined;
	}

	const status =
		(await readLastTerminalEventStatus(runDir.workdir)) ??
		(await classifyInlineStatus(inlineState));
	return {
		runId: runDir.runId,
		planSlug: runDir.planSlug,
		status,
		workdir: runDir.workdir,
		mode: "inline",
		pid: inlineState.pid,
		startedAt: inlineState.startedAt,
		lastEventAt: await readLastEventAt(runDir.workdir),
	};
}

async function classifyPidStatus(pidFile: RunPidFile): Promise<RunStatus> {
	if (!isProcessAlive(pidFile.pid)) {
		return "dead";
	}

	const actualStartedAt = await readProcessStartedAt(pidFile.pid);
	const pidStartedAt = Date.parse(pidFile.startedAt);
	if (!Number.isFinite(pidStartedAt)) {
		return "orphaned";
	}

	return Math.abs(actualStartedAt.getTime() - pidStartedAt) <=
		PROCESS_START_TOLERANCE_MS
		? "running"
		: "orphaned";
}

async function classifyInlineStatus(
	inlineState: InlineRunState,
): Promise<RunStatus> {
	if (!isProcessAlive(inlineState.pid)) {
		return "dead";
	}

	const actualStartedAt = await readProcessStartedAt(inlineState.pid);
	const runStartedAt = Date.parse(inlineState.startedAt);
	if (!Number.isFinite(runStartedAt)) {
		return "orphaned";
	}

	return actualStartedAt.getTime() <= runStartedAt + PROCESS_START_TOLERANCE_MS
		? "running"
		: "orphaned";
}

async function readProcessStartedAt(pid: number): Promise<Date> {
	const { stdout } = await execFileAsync(
		"ps",
		["-p", String(pid), "-o", "lstart="],
		{ encoding: "utf-8" },
	);
	const startedAt = new Date(stdout.trim());
	if (Number.isNaN(startedAt.getTime())) {
		throw new Error(`Unable to parse process start time for pid ${pid}`);
	}
	return startedAt;
}

async function readCompletion(
	workdir: string,
): Promise<DriverResult | undefined> {
	try {
		const raw = await readFile(join(workdir, RUN_COMPLETION_FILENAME), "utf-8");
		return JSON.parse(raw) as DriverResult;
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function readRunPid(workdir: string): Promise<RunPidFile | undefined> {
	try {
		const raw = await readFile(
			join(workdir, DETACHED_RUN_PID_FILENAME),
			"utf-8",
		);
		const parsed = JSON.parse(raw) as Partial<RunPidFile>;
		if (
			typeof parsed.pid !== "number" ||
			typeof parsed.startedAt !== "string"
		) {
			throw new Error(`Invalid run.pid in ${workdir}`);
		}
		return {
			pid: parsed.pid,
			startedAt: parsed.startedAt,
			runArgv: parsed.runArgv,
			cosmonautsPath: parsed.cosmonautsPath,
		};
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function readInlineRunState(
	workdir: string,
): Promise<InlineRunState | undefined> {
	try {
		const raw = await readFile(
			join(workdir, INLINE_RUN_STATE_FILENAME),
			"utf-8",
		);
		const parsed = JSON.parse(raw) as Partial<InlineRunState>;
		if (
			parsed.mode !== "inline" ||
			typeof parsed.pid !== "number" ||
			typeof parsed.startedAt !== "string"
		) {
			throw new Error(`Invalid run.inline.json in ${workdir}`);
		}
		return {
			mode: "inline",
			pid: parsed.pid,
			startedAt: parsed.startedAt,
		};
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}
}

async function readLastTerminalEventStatus(
	workdir: string,
): Promise<RunStatus | undefined> {
	const lines = await readEventLogLines(workdir);
	for (let index = lines.length - 1; index >= 0; index--) {
		const status = readTerminalEventStatus(lines[index] ?? "");
		if (status || readEventType(lines[index] ?? "")) {
			return status;
		}
	}
	return undefined;
}

function readTerminalEventStatus(line: string): RunStatus | undefined {
	switch (readEventType(line)) {
		case "run_completed":
			return "completed";
		case "run_aborted":
			return "aborted";
		case "run_failed":
			return "failed";
		case "run_finalization_failed":
			return "finalization_failed";
		default:
			return undefined;
	}
}

function readEventType(line: string): string | undefined {
	try {
		const parsed = JSON.parse(line) as { type?: unknown; event?: unknown };
		if (typeof parsed.type === "string") {
			return parsed.type;
		}
		if (
			typeof parsed.event === "object" &&
			parsed.event !== null &&
			"type" in parsed.event &&
			typeof parsed.event.type === "string"
		) {
			return parsed.event.type;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function readLastEventAt(workdir: string): Promise<string | undefined> {
	const lines = await readEventLogLines(workdir);
	for (let index = lines.length - 1; index >= 0; index--) {
		const timestamp = readEventTimestamp(lines[index] ?? "");
		if (timestamp) {
			return timestamp;
		}
	}
	return undefined;
}

async function readEventLogLines(workdir: string): Promise<string[]> {
	try {
		const raw = await readFile(join(workdir, "events.jsonl"), "utf-8");
		return raw.split("\n").filter((line) => line.trim().length > 0);
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

function readEventTimestamp(line: string): string | undefined {
	try {
		const parsed = JSON.parse(line) as { timestamp?: unknown };
		return typeof parsed.timestamp === "string" ? parsed.timestamp : undefined;
	} catch {
		return undefined;
	}
}

async function readDirectoryEntries(path: string) {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf-8");
		return true;
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

function runWorkdir(
	projectRoot: string,
	planSlug: string,
	runId: string,
): string {
	return join(projectRoot, "missions", "sessions", planSlug, "runs", runId);
}

async function resolveTaskIds(
	taskManager: TaskManager,
	planSlug: string,
	options: DriveRunOptions,
	resume: ResumeDefaults | undefined,
): Promise<string[]> {
	if (resume) {
		return resume.originalTaskIds;
	}
	if (options.taskIds) {
		return applyTaskLimit(splitTaskIds(options.taskIds), options.maxTasks);
	}

	return applyTaskLimit(
		await listPendingPlanTaskIds(taskManager, planSlug),
		options.maxTasks,
	);
}

function resumeModeTaskIds(
	resume: ResumeDefaults | undefined,
	taskIds: readonly string[],
): readonly string[] {
	return resume?.remainingTaskIds ?? taskIds;
}

function splitTaskIds(raw: string): string[] {
	return raw
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
}

function applyTaskLimit(taskIds: string[], maxTasks: unknown): string[] {
	if (maxTasks === undefined) {
		return taskIds;
	}
	if (typeof maxTasks !== "number") {
		throw new Error("Invalid --max-tasks value");
	}
	return taskIds.slice(0, maxTasks);
}

async function createRunSpec({
	projectRoot,
	planSlug,
	taskIds,
	options,
	resume,
	backendName,
}: {
	projectRoot: string;
	planSlug: string;
	taskIds: string[];
	options: DriveRunOptions;
	resume: ResumeDefaults | undefined;
	backendName: BackendName;
}): Promise<DriverRunSpec> {
	const runId = resume?.spec.runId ?? `run-${randomUUID()}`;
	const workdir =
		resume?.spec.workdir ??
		join(projectRoot, "missions", "sessions", planSlug, "runs", runId);
	const eventLogPath =
		resume?.spec.eventLogPath ?? join(workdir, "events.jsonl");
	const effectiveProjectRoot = resume?.spec.projectRoot ?? projectRoot;
	const promptTemplate = await resolvePromptTemplate({
		projectRoot: effectiveProjectRoot,
		options,
		resumePromptTemplate: resume?.spec.promptTemplate,
	});

	return {
		runId,
		parentSessionId: resume?.spec.parentSessionId ?? "cli",
		projectRoot: effectiveProjectRoot,
		planSlug,
		taskIds,
		backendName,
		promptTemplate,
		preflightCommands: resume?.spec.preflightCommands ?? [],
		postflightCommands: resume?.spec.postflightCommands ?? [],
		branch: options.branch ?? resume?.spec.branch,
		commitPolicy:
			options.commitPolicy ?? resume?.spec.commitPolicy ?? "driver-commits",
		stateCommitPolicy:
			options.stateCommitPolicy ?? resume?.spec.stateCommitPolicy,
		partialMode: resume?.spec.partialMode,
		workdir,
		eventLogPath,
		taskTimeoutMs: options.taskTimeout ?? resume?.spec.taskTimeoutMs,
		remainingTaskIds: resume?.remainingTaskIds,
	};
}

async function resolvePromptTemplate({
	projectRoot,
	options,
	resumePromptTemplate,
}: {
	projectRoot: string;
	options: DriveRunOptions;
	resumePromptTemplate: PromptLayers | undefined;
}): Promise<PromptLayers> {
	const envelope = await resolveEnvelopeSnapshot({
		projectRoot,
		options,
		resumePromptTemplate,
	});
	return {
		...envelope,
		preconditionPath: resolveOptionalPath(
			projectRoot,
			options.precondition ?? resumePromptTemplate?.preconditionPath,
		),
		perTaskOverrideDir: resolveOptionalPath(
			projectRoot,
			options.overrides ?? resumePromptTemplate?.perTaskOverrideDir,
		),
	};
}

async function resolveEnvelopeSnapshot({
	projectRoot,
	options,
	resumePromptTemplate,
}: {
	projectRoot: string;
	options: DriveRunOptions;
	resumePromptTemplate: PromptLayers | undefined;
}): Promise<Pick<PromptLayers, "envelopePath" | "envelopeContent">> {
	if (resumePromptTemplate?.envelopeContent !== undefined) {
		return {
			envelopePath: resolve(projectRoot, resumePromptTemplate.envelopePath),
			envelopeContent: resumePromptTemplate.envelopeContent,
		};
	}

	const envelopePath = resolve(
		projectRoot,
		options.envelope ??
			resumePromptTemplate?.envelopePath ??
			resolveDefaultDriveEnvelopePath(),
	);
	return {
		envelopePath,
		envelopeContent: await readFile(envelopePath, "utf-8"),
	};
}

function resolveOptionalPath(
	projectRoot: string,
	path: string | undefined,
): string | undefined {
	return path ? resolve(projectRoot, path) : undefined;
}

async function clearRunCompletion(workdir: string): Promise<void> {
	await rm(join(workdir, RUN_COMPLETION_FILENAME), { force: true });
}

async function prepareInlineWorkdir(spec: DriverRunSpec): Promise<void> {
	await writeDriverWorkdirInputs(spec, spec.remainingTaskIds ?? spec.taskIds);
	await clearRunCompletion(spec.workdir);
	await writeInlineRunState(spec.workdir);
}

function abortedCompletion(
	spec: Pick<DriverRunSpec, "runId">,
	error: unknown,
): DriverResult {
	return {
		runId: spec.runId,
		outcome: "aborted",
		tasksDone: 0,
		tasksBlocked: 0,
		blockedReason: formatError(error),
	};
}

async function loadResumeDefaults(
	projectRoot: string,
	planSlug: string,
	runId: string,
): Promise<ResumeDefaults> {
	const workdir = join(
		projectRoot,
		"missions",
		"sessions",
		planSlug,
		"runs",
		runId,
	);
	const spec = JSON.parse(
		await readFile(join(workdir, "spec.json"), "utf-8"),
	) as DriverRunSpec;
	const originalTaskIds = await loadOriginalDriveTaskIds({
		planSlug,
		runId,
		spec,
	});
	const events = await readDriverEvents(join(workdir, "events.jsonl"));
	const completedIndex = findHighestCompletedTaskIndex(originalTaskIds, events);
	const remainingTaskIds = originalTaskIds.slice(completedIndex + 1);
	return {
		spec: { ...spec, taskIds: originalTaskIds, remainingTaskIds },
		originalTaskIds,
		remainingTaskIds,
		pendingFinalization: await readPendingFinalization(workdir),
	};
}

async function loadOriginalDriveTaskIds({
	planSlug,
	runId,
	spec,
}: {
	planSlug: string;
	runId: string;
	spec: DriverRunSpec;
}): Promise<string[]> {
	const store = new FileRunStore({
		rootDir: join(spec.projectRoot, "missions", "sessions"),
	});
	const run = await store.loadRun({ scope: planSlug, runId });
	const metadataTaskIds = run?.metadata?.driveTaskIds;
	if (
		Array.isArray(metadataTaskIds) &&
		metadataTaskIds.every((item) => typeof item === "string")
	) {
		return [...metadataTaskIds];
	}
	return [...spec.taskIds];
}

async function hasGraphResumeState(resume: ResumeDefaults): Promise<boolean> {
	const store = new FileRunStore({
		rootDir: join(resume.spec.projectRoot, "missions", "sessions"),
	});
	const ref = { scope: resume.spec.planSlug, runId: resume.spec.runId };
	const run = await store.loadRun(ref);
	if (!run) {
		return false;
	}

	const { graph } = await store.readRunGraph(ref);
	if (graph.steps.length === 0) {
		return false;
	}

	return true;
}

async function legacyPendingFinalizationCompletion(
	resume: ResumeDefaults,
	pending: NonNullable<ResumeDefaults["pendingFinalization"]>,
): Promise<DriverResult> {
	if (pending.phase === "state_commit") {
		return {
			runId: resume.spec.runId,
			outcome: "completed",
			tasksDone: pending.taskIds.length,
			tasksBlocked: 0,
			stateCommitSha: await gitHead(resume.spec.projectRoot),
		};
	}
	return {
		runId: resume.spec.runId,
		outcome: "completed",
		tasksDone: resume.spec.taskIds.length,
		tasksBlocked: 0,
	};
}

async function retryPendingFinalization(
	resume: ResumeDefaults,
	taskManager: TaskManager,
): Promise<boolean> {
	const pending = resume.pendingFinalization;
	if (!pending) {
		return true;
	}

	const spec = resume.spec;
	const eventSink = createEventSink({
		logPath: spec.eventLogPath,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		activityBus: { publish: () => undefined },
		durable: driveDurableEventSinkOptions(spec),
	});

	if (pending.phase === "state_commit") {
		return retryPendingStateCommit(resume, taskManager, eventSink);
	}

	const result =
		pending.phase === "commit"
			? await retryPendingSourceCommit(spec, eventSink, pending)
			: { status: "committed" as const, sha: pending.commitSha };

	if (result.status === "failed") {
		await writeSourceFinalizationFailure(
			spec,
			pending.taskId,
			"commit",
			result.reason,
		);
		return false;
	}

	const taskStatusResult = await finalizePendingTaskStatus({
		spec,
		taskManager,
		eventSink,
		taskId: pending.taskId,
		commitSha: result.sha,
	});
	if (!taskStatusResult.ok) {
		await writeSourceFinalizationFailure(
			spec,
			pending.taskId,
			"task_status",
			taskStatusResult.reason,
			result.sha,
		);
		return false;
	}

	await clearPendingFinalization(spec.workdir);
	resume.remainingTaskIds = taskIdsAfterFinalizedTask(
		resume.remainingTaskIds,
		pending.taskId,
	);
	resume.spec = { ...resume.spec, remainingTaskIds: resume.remainingTaskIds };
	return true;
}

async function retryPendingStateCommit(
	resume: ResumeDefaults,
	taskManager: TaskManager,
	eventSink: (event: DriverEvent) => Promise<void>,
): Promise<boolean> {
	const pending = resume.pendingFinalization;
	if (!pending || pending.phase !== "state_commit") {
		return true;
	}
	const spec = resume.spec;
	const result = await commitFinalState(
		{ ...spec, taskIds: pending.taskIds },
		{ eventSink, abortSignal: new AbortController().signal },
		pending.taskIds,
	);
	if (result.status === "failed") {
		await writeStateFinalizationFailure(
			spec,
			pending.taskIds.length,
			result.reason,
		);
		return false;
	}

	if (result.status === "skipped" && result.reason === "no_changes") {
		const acceptance = await acceptExternalStateCommit(
			spec,
			taskManager,
			eventSink,
			pending,
		);
		if (!acceptance.ok) {
			await writeStateFinalizationFailure(
				spec,
				pending.taskIds.length,
				acceptance.reason,
			);
			return false;
		}
	}

	await clearPendingFinalization(spec.workdir);
	return true;
}

async function acceptExternalStateCommit(
	spec: DriverRunSpec,
	taskManager: TaskManager,
	eventSink: (event: DriverEvent) => Promise<void>,
	pending: Extract<
		NonNullable<ResumeDefaults["pendingFinalization"]>,
		{ phase: "state_commit" }
	>,
): Promise<{ ok: true; sha: string } | { ok: false; reason: string }> {
	const notDoneTaskId = await findFirstTaskNotDone(
		taskManager,
		pending.taskIds,
	);
	if (notDoneTaskId) {
		return {
			ok: false,
			reason: `pending state task is not Done: ${notDoneTaskId}`,
		};
	}
	const dirtyTaskPaths = await getDirtyStateTaskPaths(
		spec.projectRoot,
		pending.taskIds,
	);
	if (dirtyTaskPaths.length > 0) {
		return {
			ok: false,
			reason: `pending state task files still have changes: ${dirtyTaskPaths.join(", ")}`,
		};
	}
	const sha = await gitHead(spec.projectRoot);
	if (sha === pending.headBeforeFinalization) {
		return {
			ok: false,
			reason: "HEAD unchanged since failed state commit finalization",
		};
	}
	await emitResumeEvent(spec, eventSink, {
		type: "finalize",
		phase: "state_commit",
		status: "passed",
		details: { sha },
	});
	return { ok: true, sha };
}

async function findFirstTaskNotDone(
	taskManager: TaskManager,
	taskIds: readonly string[],
): Promise<string | undefined> {
	for (const taskId of taskIds) {
		const task = await taskManager.getTask(taskId);
		if (task?.status !== "Done") {
			return taskId;
		}
	}
	return undefined;
}

async function getDirtyStateTaskPaths(
	projectRoot: string,
	taskIds: readonly string[],
): Promise<string[]> {
	const { stdout } = await gitExec(projectRoot, [
		"status",
		"--porcelain",
		"--untracked-files=all",
		"--",
		"missions/tasks",
	]);
	const ids = new Set(taskIds);
	return stdout
		.split("\n")
		.map((line) => line.slice(3).trim())
		.filter((path) => path.length > 0)
		.filter((path) => ids.has(path.split("/").pop()?.split(" ")[0] ?? ""));
}

async function writeStateFinalizationFailure(
	spec: DriverRunSpec,
	tasksDone: number,
	reason: string,
): Promise<void> {
	await writeDurableOnlyFinalizationFailure(spec, {
		phase: "state_commit",
		reason,
	});
	const completion: DriverResult = {
		runId: spec.runId,
		outcome: "finalization_failed",
		tasksDone,
		tasksBlocked: 0,
		finalizationPhase: "state_commit",
		finalizationReason: reason,
		pendingFinalizationPath: join(spec.workdir, "pending-finalization.json"),
	};
	await writeRunCompletion(spec.workdir, completion);
	printJsonStdout(completion);
}

async function retryPendingSourceCommit(
	spec: DriverRunSpec,
	eventSink: (event: DriverEvent) => Promise<void>,
	pending: Extract<
		NonNullable<ResumeDefaults["pendingFinalization"]>,
		{ phase: "commit" }
	>,
): Promise<
	{ status: "committed"; sha: string } | { status: "failed"; reason: string }
> {
	await emitResumeEvent(spec, eventSink, {
		type: "finalize",
		taskId: pending.taskId,
		phase: "commit",
		status: "started",
		details: { subject: pending.commitSubject },
	});

	try {
		const lock = await acquireRepoCommitLock(spec.projectRoot);
		try {
			if (await hasSourceCommittableChanges(spec.projectRoot)) {
				await gitExec(spec.projectRoot, [
					"add",
					"--all",
					"--",
					".",
					...SOURCE_COMMIT_EXCLUDED_PATHS,
				]);
				if (await hasSourceStagedChanges(spec.projectRoot)) {
					await gitExec(spec.projectRoot, [
						"commit",
						"-m",
						pending.commitSubject,
					]);
					const sha = await gitHead(spec.projectRoot);
					await emitCommitAccepted(spec, eventSink, pending, sha);
					return { status: "committed", sha };
				}
			}
		} finally {
			await lock.release();
		}

		const sha = await gitHead(spec.projectRoot);
		if (!pending.headBeforeFinalization) {
			return { status: "failed", reason: "missing headBeforeFinalization" };
		}
		if (sha === pending.headBeforeFinalization) {
			return {
				status: "failed",
				reason: "HEAD unchanged since failed commit finalization",
			};
		}
		await emitCommitAccepted(spec, eventSink, pending, sha);
		return { status: "committed", sha };
	} catch (error) {
		return { status: "failed", reason: `commit failed: ${formatError(error)}` };
	}
}

async function emitCommitAccepted(
	spec: DriverRunSpec,
	eventSink: (event: DriverEvent) => Promise<void>,
	pending: Extract<
		NonNullable<ResumeDefaults["pendingFinalization"]>,
		{ phase: "commit" }
	>,
	sha: string,
): Promise<void> {
	await emitResumeEvent(spec, eventSink, {
		type: "commit_made",
		taskId: pending.taskId,
		sha,
		subject: pending.commitSubject,
	});
	await emitResumeEvent(spec, eventSink, {
		type: "finalize",
		taskId: pending.taskId,
		phase: "commit",
		status: "passed",
		details: { sha, subject: pending.commitSubject },
	});
}

async function finalizePendingTaskStatus({
	spec,
	taskManager,
	eventSink,
	taskId,
	commitSha,
}: {
	spec: DriverRunSpec;
	taskManager: TaskManager;
	eventSink: (event: DriverEvent) => Promise<void>;
	taskId: string;
	commitSha: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
	try {
		await emitResumeEvent(spec, eventSink, {
			type: "finalize",
			taskId,
			phase: "task_status",
			status: "started",
			details: { sha: commitSha },
		});
		await taskManager.updateTask(taskId, { status: "Done" });
		await emitResumeEvent(spec, eventSink, {
			type: "finalize",
			taskId,
			phase: "task_status",
			status: "passed",
			details: { sha: commitSha },
		});
		await emitResumeEvent(spec, eventSink, { type: "task_done", taskId });
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			reason: `status update failed after commit: ${formatError(error)}`,
		};
	}
}

async function writeSourceFinalizationFailure(
	spec: DriverRunSpec,
	taskId: string,
	phase: "commit" | "task_status",
	reason: string,
	commitSha?: string,
): Promise<void> {
	await writeDurableOnlyFinalizationFailure(spec, {
		phase,
		taskId,
		reason,
		commitSha,
	});
	const completion: DriverResult = {
		runId: spec.runId,
		outcome: "finalization_failed",
		tasksDone: 0,
		tasksBlocked: 0,
		finalizationPhase: phase,
		finalizationReason: reason,
		finalizationTaskId: taskId,
		...(commitSha ? { finalizationCommitSha: commitSha } : {}),
		pendingFinalizationPath: join(spec.workdir, "pending-finalization.json"),
	};
	await writeRunCompletion(spec.workdir, completion);
	printJsonStdout(completion);
}

async function writeDurableOnlyFinalizationFailure(
	spec: DriverRunSpec,
	failure: {
		phase: "commit" | "task_status" | "state_commit";
		taskId?: string;
		reason: string;
		commitSha?: string;
	},
): Promise<void> {
	try {
		const durable = driveDurableEventSinkOptions(spec);
		const store = new FileRunStore({ rootDir: durable.rootDir });
		const ref = { scope: spec.planSlug, runId: spec.runId };
		if (!(await store.loadRun(ref))) {
			await store.createRun({
				...ref,
				status: "pending",
				eventsPath: durable.eventsPath,
				policy: durable.policy,
				metadata: durable.metadata,
			});
		}
		await recordDurableFinalizerRetryFailure(
			{
				store,
				ref,
				projectRoot: spec.projectRoot,
				workdir: spec.workdir,
				configuredBackendName: spec.backendName,
				taskIds: spec.taskIds,
			},
			{ ...failure, timestamp: new Date().toISOString() },
		);
	} catch (error) {
		console.error(
			JSON.stringify({
				type: "drive_durable_event_diagnostic",
				code: "drive_durable_finalizer_failure_record_failed",
				runId: spec.runId,
				planSlug: spec.planSlug,
				message:
					"Drive durable finalizer failure recording failed; pending finalization state remains authoritative.",
				details: {
					phase: failure.phase,
					taskId: failure.taskId,
					error: formatError(error),
				},
			}),
		);
	}
}

function taskIdsAfterFinalizedTask(
	taskIds: readonly string[],
	taskId: string,
): string[] {
	const index = taskIds.indexOf(taskId);
	return index < 0 ? [...taskIds] : taskIds.slice(index + 1);
}

async function emitResumeEvent(
	spec: DriverRunSpec,
	eventSink: (event: DriverEvent) => Promise<void>,
	event: DriverEventInput,
): Promise<void> {
	const fullEvent = {
		...event,
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		timestamp: new Date().toISOString(),
	} as DriverEvent;
	await eventSink(fullEvent);
	activityBus.publish({
		type: "driver_event",
		runId: spec.runId,
		parentSessionId: spec.parentSessionId,
		event: fullEvent,
	});
}

async function hasSourceCommittableChanges(
	projectRoot: string,
): Promise<boolean> {
	const { stdout } = await gitExec(projectRoot, [
		"status",
		"--porcelain",
		"--untracked-files=all",
		"--",
		".",
		...SOURCE_COMMIT_EXCLUDED_PATHS,
	]);
	return stdout.trim().length > 0;
}

async function hasSourceStagedChanges(projectRoot: string): Promise<boolean> {
	try {
		await gitExec(projectRoot, [
			"diff",
			"--cached",
			"--quiet",
			"--",
			".",
			...SOURCE_COMMIT_EXCLUDED_PATHS,
		]);
		return false;
	} catch (error) {
		if (isExecExitCode(error, 1)) {
			return true;
		}
		throw error;
	}
}

async function gitHead(projectRoot: string): Promise<string> {
	const { stdout } = await gitExec(projectRoot, ["rev-parse", "HEAD"]);
	return stdout.trim();
}

async function gitExec(
	projectRoot: string,
	args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
	return execFileAsync("git", [...args], {
		cwd: projectRoot,
		encoding: "utf-8",
	}) as Promise<{ stdout: string; stderr: string }>;
}

function isExecExitCode(error: unknown, code: number): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

async function readDriverEvents(path: string): Promise<DriverEvent[]> {
	let raw: string;
	try {
		raw = await readFile(path, "utf-8");
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}

	const events: DriverEvent[] = [];
	for (const line of raw.split("\n")) {
		if (line.trim().length === 0) {
			continue;
		}
		events.push(JSON.parse(line) as DriverEvent);
	}
	return events;
}

function findHighestCompletedTaskIndex(
	taskIds: readonly string[],
	events: readonly DriverEvent[],
): number {
	let highest = -1;
	for (const event of events) {
		if (event.type !== "task_done" && event.type !== "task_blocked") {
			continue;
		}
		const index = taskIds.indexOf(event.taskId);
		if (index > highest) {
			highest = index;
		}
	}
	return highest;
}

async function getDirtyPaths(projectRoot: string): Promise<string[]> {
	const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
		cwd: projectRoot,
		encoding: "utf-8",
	});
	return stdout
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => line.slice(3).trim());
}

async function createBackend(
	backendName: BackendName,
	mode: DriverMode,
	projectRoot: string,
): Promise<Backend> {
	if (backendName !== "cosmonauts-subagent") {
		return resolveConfiguredExternalBackend(backendName);
	}
	if (mode === "detached") {
		throw new Error("cosmonauts-subagent cannot run in detached mode");
	}

	const frameworkRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const runtime = await CosmonautsRuntime.create({
		builtinDomainsDir: join(frameworkRoot, "domains"),
		projectRoot,
		bundledDirs: await discoverFrameworkBundledPackageDirs(frameworkRoot),
	});
	const spawner = createPiSpawner(runtime.agentRegistry, runtime.domainsDir, {
		resolver: runtime.domainResolver,
	});
	return createCosmonautsSubagentBackend({
		spawner,
		cwd: projectRoot,
		domainContext: runtime.domainContext,
		projectSkills: runtime.projectSkills,
		skillPaths: runtime.skillPaths,
	});
}

function subscribeToRunEvents(runId: string): () => void {
	const driverEventToken = activityBus.subscribe<DriverEventBusEvent>(
		"driver_event",
		(event) => {
			if (event.runId === runId) {
				printJsonStderr(event.event);
			}
		},
	);
	const driverActivityToken = activityBus.subscribe<DriverActivityBusEvent>(
		"driver_activity",
		(event) => {
			if (event.runId === runId) {
				printJsonStderr(event);
			}
		},
	);

	return () => {
		activityBus.unsubscribe(driverEventToken);
		activityBus.unsubscribe(driverActivityToken);
	};
}

function parseBackendName(value: string): BackendName {
	if (BACKENDS.includes(value as BackendName)) {
		return value as BackendName;
	}
	throw new Error(`Invalid backend "${value}". Valid: ${BACKENDS.join(", ")}`);
}

function parseDriverMode(value: string): DriverMode {
	if (MODES.includes(value as DriverMode)) {
		return value as DriverMode;
	}
	throw new Error(`Invalid mode "${value}". Valid: ${MODES.join(", ")}`);
}

function parseCommitPolicy(value: string): DriverRunSpec["commitPolicy"] {
	if (COMMIT_POLICIES.includes(value as DriverRunSpec["commitPolicy"])) {
		return value as DriverRunSpec["commitPolicy"];
	}
	throw new Error(
		`Invalid commit policy "${value}". Valid: ${COMMIT_POLICIES.join(", ")}`,
	);
}

function parseStateCommitPolicy(value: string): StateCommitPolicy {
	if (STATE_COMMIT_POLICIES.includes(value as StateCommitPolicy)) {
		return value as StateCommitPolicy;
	}
	throw new Error(
		`Invalid state commit policy "${value}". Valid: ${STATE_COMMIT_POLICIES.join(", ")}`,
	);
}

function parsePositiveInt(value: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`Expected a positive integer, got "${value}"`);
	}
	return parsed;
}

function parsePositiveNumber(value: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`Expected a non-negative number, got "${value}"`);
	}
	return parsed;
}

function printJsonStdout(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

function printJsonStderr(value: JsonError | unknown): void {
	process.stderr.write(`${JSON.stringify(value)}\n`);
}

function isErrnoError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}
