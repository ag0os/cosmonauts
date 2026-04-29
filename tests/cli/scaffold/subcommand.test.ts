import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionsScaffoldResult } from "../../../cli/scaffold/commands/missions.ts";
import {
	getMissionsScaffoldState,
	initializeMissions,
	registerMissionsCommand,
	renderMissionsScaffoldResult,
} from "../../../cli/scaffold/commands/missions.ts";
import { createScaffoldProgram } from "../../../cli/scaffold/subcommand.ts";
import { loadConfig } from "../../../lib/tasks/file-system.ts";
import { TaskManager } from "../../../lib/tasks/task-manager.ts";
import type {
	CommandTestContext,
	captureCommandOutput,
	mockProcessExitThrow,
} from "../../helpers/cli.ts";
import {
	createCommandProgram,
	createCommandTestContext,
} from "../../helpers/cli.ts";
import { createInitializedTaskManager } from "../../helpers/tasks.ts";

const COSMO_OPTIONS = ["--prefix", "COSMO", "--name", "Cosmonauts"] as const;

describe("createScaffoldProgram", () => {
	it("returns a Commander program", () => {
		const program = createScaffoldProgram();
		expect(program.name()).toBe("cosmonauts scaffold");
	});

	it("has --plain and --json global options", () => {
		const program = createScaffoldProgram();
		const opts = program.opts();
		expect(opts.plain).toBeUndefined();
		expect(opts.json).toBeUndefined();
	});

	it("registers the missions subcommand", () => {
		const program = createScaffoldProgram();
		const commandNames = program.commands.map((c) => c.name());

		expect(commandNames).toContain("missions");
	});
});

describe("renderMissionsScaffoldResult", () => {
	const alreadyInitialized: MissionsScaffoldResult = {
		status: "already_initialized",
		path: "/repo",
		message: "Task system is already initialized. Use --force to reinitialize.",
	};
	const initialized: MissionsScaffoldResult = {
		status: "initialized",
		path: "/repo",
		config: {
			prefix: "COSMO",
			projectName: "Cosmonauts",
		},
		projectConfigCreated: true,
	};

	it("returns the result object for JSON mode", () => {
		expect(renderMissionsScaffoldResult(initialized, "json")).toBe(initialized);
	});

	it("returns already initialized plain output", () => {
		expect(renderMissionsScaffoldResult(alreadyInitialized, "plain")).toEqual([
			"already_initialized",
			"path=/repo",
		]);
	});

	it("returns already initialized human output", () => {
		expect(renderMissionsScaffoldResult(alreadyInitialized, "human")).toEqual([
			"Warning: Task system is already initialized in this directory",
			"Use --force to reinitialize",
		]);
	});

	it("returns initialized plain output with project config state", () => {
		expect(renderMissionsScaffoldResult(initialized, "plain")).toEqual([
			"initialized /repo",
			"prefix=COSMO",
			"name=Cosmonauts",
			"projectConfig=created",
		]);
	});

	it("returns initialized human output with created project config", () => {
		expect(renderMissionsScaffoldResult(initialized, "human")).toEqual([
			"Initialized task system in /repo",
			"- Created missions/tasks/",
			"- Created missions/plans/",
			"- Created missions/archive/tasks/",
			"- Created missions/archive/plans/",
			"- Created missions/reviews/",
			"- Created memory/",
			"- Created missions/tasks/config.json with prefix: COSMO",
			"- Created .cosmonauts/config.json with default workflows",
			"- Project name: Cosmonauts",
		]);
	});

	it("returns initialized human output with existing project config", () => {
		expect(
			renderMissionsScaffoldResult(
				{ ...initialized, projectConfigCreated: false },
				"human",
			),
		).toContain("- .cosmonauts/config.json already exists (unchanged)");
	});
});

describe("missions scaffold helpers", () => {
	let context: CommandTestContext;
	let tempDir: string;

	beforeEach(async () => {
		context = await createCommandTestContext("scaffold-missions-helper-test-");
		tempDir = context.tempDir;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("detects when missions should initialize or are already initialized", async () => {
		await expect(getMissionsScaffoldState(tempDir)).resolves.toBe(
			"should_initialize",
		);

		await createInitializedTaskManager(tempDir, "OLD");

		await expect(getMissionsScaffoldState(tempDir)).resolves.toBe(
			"already_initialized",
		);
		await expect(getMissionsScaffoldState(tempDir, true)).resolves.toBe(
			"should_initialize",
		);
	});

	it("initializes task and project config state", async () => {
		const result = await initializeMissions(tempDir, {
			prefix: "COSMO",
			name: "Cosmonauts",
		});

		expect(result).toMatchObject({
			status: "initialized",
			path: tempDir,
			config: {
				prefix: "COSMO",
				projectName: "Cosmonauts",
			},
			projectConfigCreated: true,
		});
		await expect(loadConfig(tempDir)).resolves.toMatchObject({
			prefix: "COSMO",
			projectName: "Cosmonauts",
		});
	});
});

describe("scaffold missions command", () => {
	let tempDir: string;
	let projectRoot: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("scaffold-missions-command-test-");
		tempDir = context.tempDir;
		projectRoot = process.cwd();
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("prints already initialized output in JSON mode", async () => {
		await createInitializedTaskManager(tempDir, "OLD");

		await runMissions({ globalArgs: ["--json"] });

		expect(JSON.parse(output.stdout())).toEqual({
			status: "already_initialized",
			path: projectRoot,
			message:
				"Task system is already initialized. Use --force to reinitialize.",
		});
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints already initialized output in plain mode", async () => {
		await createInitializedTaskManager(tempDir, "OLD");

		await runMissions({ globalArgs: ["--plain"] });

		expect(output.stdout()).toBe(`already_initialized\npath=${projectRoot}\n`);
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints already initialized output in human mode", async () => {
		await createInitializedTaskManager(tempDir, "OLD");

		await runMissions();

		expect(output.stdout()).toBe(
			"Warning: Task system is already initialized in this directory\nUse --force to reinitialize\n",
		);
		expectNoCommandDiagnostics(output, exit);
	});

	it("initializes missions in JSON mode", async () => {
		await runMissions({
			globalArgs: ["--json"],
			commandArgs: COSMO_OPTIONS,
		});

		expect(JSON.parse(output.stdout())).toMatchObject({
			status: "initialized",
			path: projectRoot,
			config: {
				prefix: "COSMO",
				projectName: "Cosmonauts",
			},
			projectConfigCreated: true,
		});
		expectNoCommandDiagnostics(output, exit);
	});

	it("initializes missions in plain mode", async () => {
		await runMissions({
			globalArgs: ["--plain"],
			commandArgs: COSMO_OPTIONS,
		});

		expect(output.stdout()).toBe(
			`initialized ${projectRoot}\nprefix=COSMO\nname=Cosmonauts\nprojectConfig=created\n`,
		);
		expectNoCommandDiagnostics(output, exit);
	});

	it("initializes missions in human mode with project config created output", async () => {
		await runMissions({ commandArgs: COSMO_OPTIONS });

		expect(output.stdout()).toBe(
			expectedHumanInitializedOutput({
				projectRoot,
				projectConfigLine:
					"- Created .cosmonauts/config.json with default workflows",
				projectName: "Cosmonauts",
			}),
		);
		expectNoCommandDiagnostics(output, exit);
	});

	it("preserves an existing project config and prints unchanged output", async () => {
		const configDir = join(tempDir, ".cosmonauts");
		await mkdir(configDir, { recursive: true });
		await writeFile(
			join(configDir, "config.json"),
			'{ "skills": ["custom"] }\n',
			"utf-8",
		);

		await runMissions({ commandArgs: ["--prefix", "COSMO"] });

		expect(output.stdout()).toBe(
			expectedHumanInitializedOutput({
				projectRoot,
				projectConfigLine:
					"- .cosmonauts/config.json already exists (unchanged)",
			}),
		);
		await expect(
			readFile(join(configDir, "config.json"), "utf-8"),
		).resolves.toBe('{ "skills": ["custom"] }\n');
		expectNoCommandDiagnostics(output, exit);
	});

	it("reinitializes missions when force is set", async () => {
		await createInitializedTaskManager(tempDir, "OLD");

		await runMissions({
			globalArgs: ["--plain"],
			commandArgs: ["--force", "--prefix", "NEW", "--name", "Forced"],
		});

		await expect(loadConfig(tempDir)).resolves.toMatchObject({
			prefix: "NEW",
			projectName: "Forced",
		});
		expect(output.stdout()).toBe(
			`initialized ${projectRoot}\nprefix=NEW\nname=Forced\nprojectConfig=created\n`,
		);
		expectNoCommandDiagnostics(output, exit);
	});

	it("rejects TaskManager init errors without printing output", async () => {
		vi.spyOn(TaskManager.prototype, "init").mockRejectedValue(
			new Error("disk full"),
		);

		await expect(runMissions()).rejects.toThrow("disk full");

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("rejects project config scaffold errors without printing output", async () => {
		await writeFile(join(tempDir, ".cosmonauts"), "not a directory", "utf-8");

		await expect(runMissions()).rejects.toThrow();

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});
});

function createProgram() {
	return createCommandProgram(registerMissionsCommand);
}

interface MissionsCommandInvocation {
	globalArgs?: readonly string[];
	commandArgs?: readonly string[];
}

async function runMissions({
	globalArgs = [],
	commandArgs = [],
}: MissionsCommandInvocation = {}): Promise<void> {
	await createProgram().parseAsync([
		"node",
		"test",
		...globalArgs,
		"missions",
		...commandArgs,
	]);
}

function expectNoCommandDiagnostics(
	output: ReturnType<typeof captureCommandOutput>,
	exit: ReturnType<typeof mockProcessExitThrow>,
): void {
	expect(output.stderr()).toBe("");
	expect(exit.calls()).toEqual([]);
}

interface HumanInitializedOutputExpectation {
	projectRoot: string;
	projectConfigLine: string;
	projectName?: string;
}

function expectedHumanInitializedOutput({
	projectRoot,
	projectConfigLine,
	projectName,
}: HumanInitializedOutputExpectation): string {
	const lines = [
		`Initialized task system in ${projectRoot}`,
		"- Created missions/tasks/",
		"- Created missions/plans/",
		"- Created missions/archive/tasks/",
		"- Created missions/archive/plans/",
		"- Created missions/reviews/",
		"- Created memory/",
		"- Created missions/tasks/config.json with prefix: COSMO",
		projectConfigLine,
	];

	if (projectName) {
		lines.push(`- Project name: ${projectName}`);
	}

	lines.push("");
	return lines.join("\n");
}
