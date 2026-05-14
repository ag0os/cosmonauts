import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Command } from "commander";
import { readClaudeArgsFromEnv } from "../../lib/driver/backends/claude-cli.ts";
import {
	readCodexArgsFromEnv,
	readCodexExecArgsFromEnv,
} from "../../lib/driver/backends/codex.ts";
import { createCosmonautsSubagentBackend } from "../../lib/driver/backends/cosmonauts-subagent.ts";
import { resolveBackend } from "../../lib/driver/backends/registry.ts";
import type { Backend } from "../../lib/driver/backends/types.ts";
import { runInline, startDetached } from "../../lib/driver/driver.ts";
import type {
	DriverActivityBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import { isProcessAlive } from "../../lib/driver/lock.ts";
import { DEFAULT_TASK_TIMEOUT_MS } from "../../lib/driver/run-one-task.ts";
import {
	DETACHED_RUN_PID_FILENAME,
	INLINE_RUN_STATE_FILENAME,
	type InlineRunState,
	RUN_COMPLETION_FILENAME,
	writeInlineRunState,
	writeRunCompletion,
} from "../../lib/driver/run-state.ts";
import type {
	BackendName,
	DriverEvent,
	DriverResult,
	DriverRunSpec,
} from "../../lib/driver/types.ts";
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
	taskIds: string[];
}

interface JsonError {
	error: string;
	[key: string]: unknown;
}

interface DriveStatusOptions {
	plan?: string;
}

interface RunPidFile {
	pid: number;
	startedAt: string;
	runArgv?: string[];
	cosmonautsPath?: string;
}

type RunStatus = DriverResult["outcome"] | "dead" | "running" | "orphaned";

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
const PROCESS_START_TOLERANCE_MS = 5_000;
const execFileAsync = promisify(execFile);

export function createDriveProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts drive")
		.description("Run plan-linked tasks with Cosmonauts Drive")
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

function configureRunCommand(command: Command): void {
	command
		.requiredOption("--plan <slug>", "Plan slug to run")
		.option("--task-ids <id1,id2,...>", "Comma-separated task IDs to run")
		.option(
			"--backend <backend>",
			"Driver backend: codex, claude-cli, or cosmonauts-subagent (codex --full-auto sandboxes sockets/network by default)",
			parseBackendName,
		)
		.option("--mode <mode>", "Driver mode: inline or detached", parseDriverMode)
		.option("--branch <name>", "Expected branch for driver commits")
		.option(
			"--commit-policy <policy>",
			"Commit policy: driver-commits, backend-commits, or no-commit",
			parseCommitPolicy,
		)
		.option("--envelope <path>", "Prompt envelope path")
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

async function runDrive(options: DriveRunOptions): Promise<void> {
	if (!options.plan) {
		throw new Error("Missing required option '--plan <slug>'");
	}
	const projectRoot = process.cwd();
	const planSlug = options.plan;
	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();

	const resume = options.resume
		? await loadResumeDefaults(projectRoot, planSlug, options.resume)
		: undefined;
	if (resume && !options.resumeDirty) {
		const dirtyPaths = await getDirtyPaths(projectRoot);
		if (dirtyPaths.length > 0) {
			printJsonStderr({
				error: "dirty_worktree",
				runId: options.resume,
				planSlug,
				dirtyPaths,
				message:
					"Refusing to resume with a dirty worktree. Pass --resume-dirty to override.",
			});
			process.exitCode = 1;
			return;
		}
	}

	const taskIds = applyTaskLimit(
		await resolveTaskIds(taskManager, planSlug, options, resume),
		options.maxTasks,
	);
	const mode = options.mode ?? (taskIds.length >= 5 ? "detached" : "inline");
	const backendName = options.backend ?? resume?.spec.backendName ?? "codex";

	if (mode === "detached" && backendName === "cosmonauts-subagent") {
		printJsonStderr({
			error: "detached_backend_not_supported",
			backend: backendName,
			mode,
			message:
				"Backend cosmonauts-subagent is not supported for detached mode.",
		});
		process.exitCode = 1;
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
		const handle = startDetached(spec, deps);
		printJsonStdout({
			runId: handle.runId,
			planSlug: handle.planSlug,
			workdir: handle.workdir,
			eventLogPath: handle.eventLogPath,
		});
		return;
	}

	await prepareInlineWorkdir(spec);
	const unsubscribe = subscribeToRunEvents(spec.runId);
	try {
		const handle = runInline(spec, deps);
		const result = await handle.result.catch(async (error: unknown) => {
			await writeRunCompletion(spec.workdir, abortedCompletion(spec, error));
			throw error;
		});
		await writeRunCompletion(spec.workdir, result);
		printJsonStdout(result);
		process.exitCode = result.outcome === "completed" ? 0 : 1;
	} finally {
		unsubscribe();
	}
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
		const status = await classifyPidStatus(pidFile);
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

	const status = await classifyInlineStatus(inlineState);
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

async function readLastEventAt(workdir: string): Promise<string | undefined> {
	let raw: string;
	try {
		raw = await readFile(join(workdir, "events.jsonl"), "utf-8");
	} catch (error) {
		if (isErrnoError(error) && error.code === "ENOENT") {
			return undefined;
		}
		throw error;
	}

	const lines = raw.split("\n").filter((line) => line.trim().length > 0);
	for (let index = lines.length - 1; index >= 0; index--) {
		const timestamp = readEventTimestamp(lines[index] ?? "");
		if (timestamp) {
			return timestamp;
		}
	}
	return undefined;
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
		return resume.taskIds;
	}
	if (options.taskIds) {
		return splitTaskIds(options.taskIds);
	}

	const tasks = await taskManager.listTasks({ label: `plan:${planSlug}` });
	return tasks.filter((task) => task.status !== "Done").map((task) => task.id);
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
	const envelopePath =
		options.envelope ??
		resume?.spec.promptTemplate.envelopePath ??
		resolveDefaultEnvelopePath();

	return {
		runId,
		parentSessionId: resume?.spec.parentSessionId ?? "cli",
		projectRoot: resume?.spec.projectRoot ?? projectRoot,
		planSlug,
		taskIds,
		backendName,
		promptTemplate: {
			envelopePath: resolve(projectRoot, envelopePath),
			preconditionPath: resolveOptionalPath(
				projectRoot,
				options.precondition ?? resume?.spec.promptTemplate.preconditionPath,
			),
			perTaskOverrideDir: resolveOptionalPath(
				projectRoot,
				options.overrides ?? resume?.spec.promptTemplate.perTaskOverrideDir,
			),
		},
		preflightCommands: resume?.spec.preflightCommands ?? [],
		postflightCommands: resume?.spec.postflightCommands ?? [],
		branch: options.branch ?? resume?.spec.branch,
		commitPolicy:
			options.commitPolicy ?? resume?.spec.commitPolicy ?? "driver-commits",
		partialMode: resume?.spec.partialMode,
		workdir,
		eventLogPath,
		taskTimeoutMs: options.taskTimeout ?? resume?.spec.taskTimeoutMs,
	};
}

function resolveOptionalPath(
	projectRoot: string,
	path: string | undefined,
): string | undefined {
	return path ? resolve(projectRoot, path) : undefined;
}

function resolveDefaultEnvelopePath(): string {
	const frameworkRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const envelopePath = join(
		frameworkRoot,
		"bundled",
		"coding",
		"coding",
		"drivers",
		"templates",
		"envelope.md",
	);
	if (existsSync(envelopePath)) {
		return envelopePath;
	}
	throw new Error(
		"Missing --envelope and no bundled coding driver envelope was found.",
	);
}

async function prepareInlineWorkdir(spec: DriverRunSpec): Promise<void> {
	await mkdir(spec.workdir, { recursive: true });
	await mkdir(dirname(spec.eventLogPath), { recursive: true });
	await writeFile(
		join(spec.workdir, "spec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf-8",
	);
	await writeFile(
		join(spec.workdir, "task-queue.txt"),
		`${spec.taskIds.join("\n")}\n`,
		"utf-8",
	);
	await rm(join(spec.workdir, RUN_COMPLETION_FILENAME), { force: true });
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

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error !== null) {
		return JSON.stringify(error);
	}
	return String(error);
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
	const events = await readDriverEvents(join(workdir, "events.jsonl"));
	const completedIndex = findHighestCompletedTaskIndex(spec.taskIds, events);
	return {
		spec,
		taskIds: spec.taskIds.slice(completedIndex + 1),
	};
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
	if (backendName === "codex") {
		return resolveBackend(backendName, {
			codexBinary: process.env.COSMONAUTS_DRIVER_CODEX_BINARY,
			codexArgs: readCodexArgsFromEnv(),
			codexExtraArgs: readCodexExecArgsFromEnv(),
		});
	}
	if (backendName === "claude-cli") {
		return resolveBackend(backendName, {
			claudeBinary: process.env.COSMONAUTS_DRIVER_CLAUDE_BINARY,
			claudeArgs: readClaudeArgsFromEnv(),
		});
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
