import type { Command } from "commander";
import { scaffoldProjectConfig } from "../../../lib/config/index.js";
import { loadConfig } from "../../../lib/tasks/file-system.js";
import { TaskManager } from "../../../lib/tasks/task-manager.js";
import type { ForgeTasksConfig } from "../../../lib/tasks/task-types.ts";
import type { CliGlobalOptions, CliOutputMode } from "../../shared/output.ts";
import { getOutputMode, printJson, printLines } from "../../shared/output.ts";

interface MissionsOptions {
	prefix: string;
	name?: string;
	force?: boolean;
}

type MissionsScaffoldState = "already_initialized" | "should_initialize";

interface MissionsAlreadyInitializedResult {
	status: "already_initialized";
	path: string;
	message: string;
}

interface MissionsInitializedResult {
	status: "initialized";
	path: string;
	config: ForgeTasksConfig;
	projectConfigCreated: boolean;
}

export type MissionsScaffoldResult =
	| MissionsAlreadyInitializedResult
	| MissionsInitializedResult;

/** Core scaffolding logic shared by `scaffold missions` and the `task init` alias. */
export async function scaffoldMissions(
	options: MissionsOptions,
	globalOptions: CliGlobalOptions,
): Promise<void> {
	const projectRoot = process.cwd();
	const mode = getOutputMode(globalOptions);
	const state = await getMissionsScaffoldState(projectRoot, options.force);
	const result =
		state === "already_initialized"
			? createAlreadyInitializedResult(projectRoot)
			: await initializeMissions(projectRoot, options);

	printMissionsScaffoldResult(result, mode);
}

export async function getMissionsScaffoldState(
	projectRoot: string,
	force = false,
): Promise<MissionsScaffoldState> {
	const existingConfig = await loadConfig(projectRoot);
	if (existingConfig && !force) {
		return "already_initialized";
	}

	return "should_initialize";
}

export async function initializeMissions(
	projectRoot: string,
	options: MissionsOptions,
): Promise<MissionsScaffoldResult> {
	const manager = new TaskManager(projectRoot);
	const config = await manager.init({
		prefix: options.prefix,
		projectName: options.name,
	});

	const configCreated = await scaffoldProjectConfig(projectRoot);

	return {
		status: "initialized",
		path: projectRoot,
		config,
		projectConfigCreated: configCreated,
	};
}

export function renderMissionsScaffoldResult(
	result: MissionsScaffoldResult,
	mode: CliOutputMode,
): unknown | string[] {
	if (mode === "json") {
		return result;
	}

	if (result.status === "already_initialized") {
		return renderAlreadyInitializedResult(result, mode);
	}

	return renderInitializedResult(result, mode);
}

export function registerMissionsCommand(program: Command): void {
	program
		.command("missions")
		.description(
			"Scaffold missions directories and task system in the current directory",
		)
		.option("-p, --prefix <prefix>", "Task ID prefix", "TASK")
		.option("-n, --name <name>", "Project name")
		.option("-f, --force", "Force reinitialize even if already initialized")
		.action(async (options) => {
			await scaffoldMissions(options, program.opts());
		});
}

function createAlreadyInitializedResult(
	projectRoot: string,
): MissionsScaffoldResult {
	return {
		status: "already_initialized",
		path: projectRoot,
		message: "Task system is already initialized. Use --force to reinitialize.",
	};
}

function printMissionsScaffoldResult(
	result: MissionsScaffoldResult,
	mode: CliOutputMode,
): void {
	const rendered = renderMissionsScaffoldResult(result, mode);

	if (mode === "json") {
		printJson(rendered);
		return;
	}

	printLines(rendered as string[]);
}

function renderAlreadyInitializedResult(
	result: MissionsAlreadyInitializedResult,
	mode: CliOutputMode,
): string[] {
	if (mode === "plain") {
		return [result.status, `path=${result.path}`];
	}

	return [
		"Warning: Task system is already initialized in this directory",
		"Use --force to reinitialize",
	];
}

function renderInitializedResult(
	result: MissionsInitializedResult,
	mode: CliOutputMode,
): string[] {
	if (mode === "plain") {
		return renderInitializedPlainResult(result);
	}

	return renderInitializedHumanResult(result);
}

function renderInitializedPlainResult(
	result: MissionsInitializedResult,
): string[] {
	const lines = [
		`initialized ${result.path}`,
		`prefix=${result.config.prefix}`,
	];

	if (result.config.projectName) {
		lines.push(`name=${result.config.projectName}`);
	}

	lines.push(
		`projectConfig=${result.projectConfigCreated ? "created" : "exists"}`,
	);
	return lines;
}

function renderInitializedHumanResult(
	result: MissionsInitializedResult,
): string[] {
	const lines = [
		`Initialized task system in ${result.path}`,
		"- Created missions/tasks/",
		"- Created missions/plans/",
		"- Created missions/archive/tasks/",
		"- Created missions/archive/plans/",
		"- Created missions/reviews/",
		"- Created memory/",
		`- Created missions/tasks/config.json with prefix: ${result.config.prefix}`,
		renderProjectConfigLine(result.projectConfigCreated),
	];

	if (result.config.projectName) {
		lines.push(`- Project name: ${result.config.projectName}`);
	}

	return lines;
}

function renderProjectConfigLine(created: boolean): string {
	return created
		? "- Created .cosmonauts/config.json with default workflows"
		: "- .cosmonauts/config.json already exists (unchanged)";
}
