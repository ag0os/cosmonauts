import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Command } from "commander";
import { createCosmonautsSubagentBackend } from "../../lib/driver/backends/cosmonauts-subagent.ts";
import { resolveBackend } from "../../lib/driver/backends/registry.ts";
import type { Backend } from "../../lib/driver/backends/types.ts";
import { runInline, startDetached } from "../../lib/driver/driver.ts";
import type {
	DriverActivityBusEvent,
	DriverEventBusEvent,
} from "../../lib/driver/event-stream.ts";
import type {
	BackendName,
	DriverEvent,
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
const execFileAsync = promisify(execFile);

export function createDriveProgram(): Command {
	const program = new Command();

	program
		.name("cosmonauts drive")
		.description("Run Cosmonauts driver task fleets")
		.version("1.0.0");

	const run = program
		.command("run", { isDefault: true })
		.description("Run a driver task fleet");
	configureRunCommand(run);

	return program;
}

function configureRunCommand(command: Command): void {
	command
		.requiredOption("--plan <slug>", "Plan slug to run")
		.option("--task-ids <id1,id2,...>", "Comma-separated task IDs to run")
		.option(
			"--backend <backend>",
			"Driver backend: codex, claude-cli, or cosmonauts-subagent",
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
			"Per-task timeout in milliseconds",
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
		const result = await handle.result;
		printJsonStdout(result);
		process.exitCode = result.outcome === "completed" ? 0 : 1;
	} finally {
		unsubscribe();
	}
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
	if (backendName !== "cosmonauts-subagent") {
		return resolveBackend(backendName, {
			codexBinary: process.env.COSMONAUTS_DRIVER_CODEX_BINARY,
			claudeBinary: process.env.COSMONAUTS_DRIVER_CLAUDE_BINARY,
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
