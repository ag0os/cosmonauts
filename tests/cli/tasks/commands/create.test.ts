import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseTaskBatchInputs,
	parseTaskBatchYaml,
	parseTaskCreateInput,
	parseTaskDueDate,
	registerCreateCommand,
	renderTaskCreateSuccess,
} from "../../../../cli/tasks/commands/create.ts";
import {
	createMarkdownMemoryStore,
	parseEpisodeRecord,
} from "../../../../lib/memory/index.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../../lib/tasks/task-types.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	expectInvalidPriorityDiagnostics,
	type mockProcessExitThrow,
	ProcessExitError,
} from "../../../helpers/cli.ts";
import { createInitializedTaskManager } from "../../../helpers/tasks.ts";

describe("parseTaskCreateInput", () => {
	it("returns a task create input for all CLI options", () => {
		const result = parseTaskCreateInput("Full Task", {
			description: "A complete task",
			priority: "high",
			assignee: "john",
			label: ["backend", "api"],
			due: "2026-02-01",
			dependsOn: ["TASK-001"],
			ac: ["Write tests"],
			parent: "TASK-000",
		});

		expect(result).toEqual({
			ok: true,
			value: {
				title: "Full Task",
				description: "A complete task",
				priority: "high",
				assignee: "john",
				labels: ["backend", "api"],
				dueDate: new Date("2026-02-01"),
				dependencies: ["TASK-001"],
				acceptanceCriteria: ["Write tests"],
				parent: "TASK-000",
			},
		});
	});

	it("rejects invalid priority values", () => {
		expect(
			parseTaskCreateInput("Bad Priority", { priority: "urgent" }),
		).toEqual({
			ok: false,
			error: "Invalid priority: urgent. Must be one of: high, medium, low",
		});
	});
});

describe("parseTaskDueDate", () => {
	it("returns undefined for missing dates", () => {
		expect(parseTaskDueDate(undefined)).toEqual({
			ok: true,
			value: undefined,
		});
	});

	it("parses valid dates", () => {
		expect(parseTaskDueDate("2026-02-01")).toEqual({
			ok: true,
			value: new Date("2026-02-01"),
		});
	});

	it("rejects invalid dates", () => {
		expect(parseTaskDueDate("not-a-date")).toEqual({
			ok: false,
			error: "Invalid date format: not-a-date. Use YYYY-MM-DD format.",
		});
	});
});

describe("renderTaskCreateSuccess", () => {
	const task: Task = {
		id: "TASK-001",
		title: "Rendered Task",
		status: "To Do",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		labels: [],
		dependencies: [],
		acceptanceCriteria: [],
	};

	it("returns the task object for JSON mode", () => {
		expect(renderTaskCreateSuccess(task, "json")).toBe(task);
	});

	it("returns the task ID line for plain mode", () => {
		expect(renderTaskCreateSuccess(task, "plain")).toEqual(["TASK-001"]);
	});

	it("returns the human success line for human mode", () => {
		expect(renderTaskCreateSuccess(task, "human")).toEqual([
			"Created task TASK-001: Rendered Task",
		]);
	});
});

describe("task create command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-create-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("creates a task with all create options in human mode", async () => {
		const program = createProgram();

		await program.parseAsync([
			"node",
			"test",
			"create",
			"Full Task",
			"--description",
			"A complete task",
			"--priority",
			"high",
			"--assignee",
			"john",
			"--label",
			"backend",
			"--label",
			"api",
			"--due",
			"2026-02-01",
			"--depends-on",
			"TASK-001",
			"--depends-on",
			"TASK-002",
			"--ac",
			"Write tests",
			"--ac",
			"Implement feature",
			"--parent",
			"TASK-000",
		]);

		const manager = new TaskManager(tempDir);
		const task = await manager.getTask("TASK-001");

		expect(task).toMatchObject({
			id: "TASK-001",
			title: "Full Task",
			description: "A complete task",
			priority: "high",
			assignee: "john",
			labels: ["backend", "api"],
			dependencies: ["TASK-001", "TASK-002"],
			acceptanceCriteria: [
				{ index: 1, text: "Write tests", checked: false },
				{ index: 2, text: "Implement feature", checked: false },
			],
		});
		expect(task?.dueDate).toEqual(new Date("2026-02-01"));
		expect(output.stdout()).toBe("Created task TASK-001: Full Task\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("keeps disabled task create output and files episode-free", async () => {
		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"Disabled CLI Task",
		]);

		expect(output.stdout()).toBe("Created task TASK-001: Disabled CLI Task\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
		expect(await readProjectEpisodes(tempDir)).toEqual([]);
		expect(await pathExists(join(tempDir, "memory/agent/index.md"))).toBe(
			false,
		);
	});

	it("records enabled task create provenance as cosmonauts/cli", async () => {
		await writeEpisodicConfig(tempDir);
		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"Enabled CLI Task",
		]);

		expect(output.stdout()).toBe("Created task TASK-001: Enabled CLI Task\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
		const records = await readProjectEpisodes(tempDir);
		expect(records).toHaveLength(1);
		expect(records[0]?.source).toBe("cosmonauts/cli");
		expect(records[0] && parseEpisodeRecord(records[0])).toMatchObject({
			action: "task.created",
			outcome: "to-do",
			subject: { kind: "task", id: "TASK-001" },
		});
	});

	it("keeps task create successful and warns once when capture fails", async () => {
		await writeEpisodicConfig(tempDir);
		await mkdir(join(tempDir, "memory"), { recursive: true });
		await writeFile(join(tempDir, "memory/agent"), "path collision", "utf-8");
		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"Warning CLI Task",
		]);

		expect(output.stdout()).toBe("Created task TASK-001: Warning CLI Task\n");
		expect(output.stderr()).toContain("Episode capture skipped");
		expect(output.stderr().match(/Episode capture skipped/gu)).toHaveLength(1);
		expect(exit.calls()).toEqual([]);
		expect(await new TaskManager(tempDir).getTask("TASK-001")).toMatchObject({
			id: "TASK-001",
			title: "Warning CLI Task",
		});
	});

	it("leaves an existing task config byte-unchanged when creating a single task", async () => {
		// @cosmo-behavior plan:task-id-system#B-010
		const configPath = await writeTaskConfig(
			tempDir,
			'{\n  "prefix": "BUG",\n  "zeroPadding": 2,\n  "defaultLabels": ["from-config"]\n}\n',
		);
		const before = await readFile(configPath, "utf-8");

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"Existing Config Task",
		]);

		expect(await readFile(configPath, "utf-8")).toBe(before);
		expect(await listTaskDirectoryEntries(tempDir)).toEqual([
			"BUG-01 - Existing Config Task.md",
			"config.json",
		]);
		expect(output.stdout()).toBe("Created task BUG-01: Existing Config Task\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("creates only a task file and no task config when creating a single task without config", async () => {
		// @cosmo-behavior plan:task-id-system#B-010
		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"No Config Task",
		]);

		expect(await pathExists(taskConfigPath(tempDir))).toBe(false);
		expect(await listTaskDirectoryEntries(tempDir)).toEqual([
			"TASK-001 - No Config Task.md",
		]);
		expect(output.stdout()).toBe("Created task TASK-001: No Config Task\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints invalid priority errors in JSON mode", async () => {
		await expectInvalidPriorityError(
			["--json", "create", "Bad Priority", "--priority", "urgent"],
			output,
			exit,
		);
	});

	it("prints invalid priority errors in human mode", async () => {
		await expectInvalidPriorityError(
			["create", "Bad Priority", "--priority", "urgent"],
			output,
			exit,
		);
	});

	it("prints invalid due date errors in JSON mode", async () => {
		await expectCreateToExit([
			"--json",
			"create",
			"Bad Date",
			"--due",
			"not-a-date",
		]);

		expect(output.stdout()).toBe(
			'{\n  "error": "Invalid date format: not-a-date. Use YYYY-MM-DD format."\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("prints invalid due date errors in human mode", async () => {
		await expectCreateToExit(["create", "Bad Date", "--due", "not-a-date"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe(
			"Error: Invalid date format: not-a-date. Use YYYY-MM-DD format.\n",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("prints the task ID in plain mode", async () => {
		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"create",
			"Plain Task",
		]);

		expect(output.stdout()).toBe("TASK-001\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints manager errors in JSON mode", async () => {
		vi.spyOn(TaskManager.prototype, "createTask").mockRejectedValue(
			new Error("disk full"),
		);

		await expectCreateToExit(["--json", "create", "Failure"]);

		expect(output.stdout()).toBe('{\n  "error": "Error: disk full"\n}\n');
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("prints manager errors in human mode", async () => {
		await createInitializedTaskManager(tempDir);
		vi.spyOn(TaskManager.prototype, "createTask").mockRejectedValue(
			new Error("disk full"),
		);

		await expectCreateToExit(["create", "Failure"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error creating task: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});
});

describe("parseTaskBatchYaml", () => {
	it("parses a YAML array of task specs", () => {
		const result = parseTaskBatchYaml("- title: First\n- title: Second\n");
		expect(result).toEqual({
			ok: true,
			value: [{ title: "First" }, { title: "Second" }],
		});
	});

	it("reports a clean error message for malformed YAML", () => {
		const result = parseTaskBatchYaml("- title: ok\n  bad: [unterminated\n");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toMatch(/^Invalid YAML in batch file:/);
		}
	});
});

describe("parseTaskBatchInputs", () => {
	it("normalizes rich rows into TaskCreateInput objects in order", () => {
		const rows = [
			{
				title: "Build login",
				description: "Auth UI",
				priority: "high",
				labels: ["frontend", "auth"],
				ac: ["Email validates", "Password meter"],
				dependencies: ["TASK-099"],
				parent: "TASK-100",
				due: "2026-06-01",
				assignee: "alice",
			},
			{ title: "Wire OAuth" },
		];

		const result = parseTaskBatchInputs(rows);
		expect(result).toEqual({
			ok: true,
			value: [
				{
					title: "Build login",
					description: "Auth UI",
					priority: "high",
					assignee: "alice",
					labels: ["frontend", "auth"],
					dueDate: new Date("2026-06-01"),
					dependencies: ["TASK-099"],
					acceptanceCriteria: ["Email validates", "Password meter"],
					parent: "TASK-100",
				},
				{
					title: "Wire OAuth",
					description: undefined,
					priority: undefined,
					assignee: undefined,
					labels: undefined,
					dueDate: undefined,
					dependencies: undefined,
					acceptanceCriteria: undefined,
					parent: undefined,
				},
			],
		});
	});

	it("rejects non-array top-level values", () => {
		expect(parseTaskBatchInputs({ title: "lonely" })).toEqual({
			ok: false,
			error:
				"Batch file must contain a YAML array of task specs at the top level.",
		});
	});

	it("rejects an empty array", () => {
		expect(parseTaskBatchInputs([])).toEqual({
			ok: false,
			error: "Batch file contains no task rows.",
		});
	});

	it("rejects a row missing a title", () => {
		expect(parseTaskBatchInputs([{ description: "no title" }])).toEqual({
			ok: false,
			error: 'row 1: missing required field "title".',
		});
	});

	it("reports the row index when a later row is invalid", () => {
		expect(parseTaskBatchInputs([{ title: "ok" }, { title: 7 }])).toEqual({
			ok: false,
			error: 'row 2: missing required field "title".',
		});
	});

	it("rejects invalid priority values per row", () => {
		expect(
			parseTaskBatchInputs([{ title: "bad", priority: "urgent" }]),
		).toEqual({
			ok: false,
			error:
				'row 1: invalid priority "urgent". Must be one of: high, medium, low.',
		});
	});

	it("rejects non-string-array labels", () => {
		expect(
			parseTaskBatchInputs([{ title: "ok", labels: ["frontend", 5] }]),
		).toEqual({
			ok: false,
			error: 'row 1: "labels" must be an array of strings.',
		});
	});

	it("rejects rows that are arrays rather than mappings", () => {
		expect(parseTaskBatchInputs([["title", "ok"]])).toEqual({
			ok: false,
			error: "row 1: expected a mapping of task fields.",
		});
	});

	it("accepts a Date object for `due` (what js-yaml produces for unquoted YAML timestamps)", () => {
		const due = new Date("2026-06-01T00:00:00.000Z");
		const result = parseTaskBatchInputs([{ title: "ok", due }]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value[0]?.dueDate).toEqual(due);
		}
	});

	it("rejects a Date object whose timestamp is NaN", () => {
		const result = parseTaskBatchInputs([
			{ title: "ok", due: new Date("not-a-date") },
		]);
		expect(result).toEqual({
			ok: false,
			error: 'row 1: "due" is not a valid date.',
		});
	});

	it("rejects `due` values that are neither a string nor a Date", () => {
		expect(parseTaskBatchInputs([{ title: "ok", due: 12345 }])).toEqual({
			ok: false,
			error:
				'row 1: "due" must be a date string (YYYY-MM-DD) or a YAML date value.',
		});
	});
});

describe("task create --from-file", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-create-batch-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	async function writeBatch(name: string, contents: string): Promise<string> {
		const path = join(tempDir, name);
		await writeFile(path, contents, "utf-8");
		return path;
	}

	it("creates each row in order and prints a human summary by default", async () => {
		const path = await writeBatch(
			"tasks.yaml",
			"- title: First task\n- title: Second task\n  priority: high\n",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"--from-file",
			path,
		]);

		const manager = new TaskManager(tempDir);
		const first = await manager.getTask("TASK-001");
		const second = await manager.getTask("TASK-002");
		expect(first?.title).toBe("First task");
		expect(second?.title).toBe("Second task");
		expect(second?.priority).toBe("high");
		expect(output.stdout()).toBe(
			"Created task TASK-001: First task\nCreated task TASK-002: Second task\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("preserves batch allocation and output when enabled capture fails", async () => {
		await writeEpisodicConfig(tempDir);
		await mkdir(join(tempDir, "memory"), { recursive: true });
		await writeFile(join(tempDir, "memory/agent"), "path collision", "utf-8");
		const path = await writeBatch(
			"warning-tasks.yaml",
			"- title: First warning task\n- title: Second warning task\n",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"--from-file",
			path,
		]);

		expect(await listTaskDirectoryEntries(tempDir)).toEqual([
			"TASK-001 - First warning task.md",
			"TASK-002 - Second warning task.md",
		]);
		expect(output.stdout()).toBe(
			"Created task TASK-001: First warning task\nCreated task TASK-002: Second warning task\n",
		);
		expect(output.stderr().match(/Episode capture skipped/gu)).toHaveLength(2);
		expect(exit.calls()).toEqual([]);
	});

	it("leaves an existing task config byte-unchanged when batch creating tasks", async () => {
		// @cosmo-behavior plan:task-id-system#B-010
		const configPath = await writeTaskConfig(
			tempDir,
			'{\n  "prefix": "BATCH",\n  "zeroPadding": 2,\n  "defaultPriority": "low"\n}\n',
		);
		const before = await readFile(configPath, "utf-8");
		const path = await writeBatch(
			"tasks.yaml",
			"- title: First batch task\n- title: Second batch task\n",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"--from-file",
			path,
		]);

		expect(await readFile(configPath, "utf-8")).toBe(before);
		expect(await listTaskDirectoryEntries(tempDir)).toEqual([
			"BATCH-01 - First batch task.md",
			"BATCH-02 - Second batch task.md",
			"config.json",
		]);
		expect(output.stdout()).toBe(
			"Created task BATCH-01: First batch task\nCreated task BATCH-02: Second batch task\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("creates only task files and no task config when batch creating without config", async () => {
		// @cosmo-behavior plan:task-id-system#B-010
		const path = await writeBatch(
			"tasks.yaml",
			"- title: First no config\n- title: Second no config\n",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"--from-file",
			path,
		]);

		expect(await pathExists(taskConfigPath(tempDir))).toBe(false);
		expect(await listTaskDirectoryEntries(tempDir)).toEqual([
			"TASK-001 - First no config.md",
			"TASK-002 - Second no config.md",
		]);
		expect(output.stdout()).toBe(
			"Created task TASK-001: First no config\nCreated task TASK-002: Second no config\n",
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("accepts unquoted YAML dates in `due` and stores the parsed dueDate", async () => {
		const path = await writeBatch(
			"with-date.yaml",
			"- title: Has a due date\n  due: 2026-06-01\n",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"create",
			"--from-file",
			path,
		]);

		const manager = new TaskManager(tempDir);
		const task = await manager.getTask("TASK-001");
		expect(task?.dueDate).toEqual(new Date("2026-06-01T00:00:00.000Z"));
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("emits a JSON array of created tasks when --json is set", async () => {
		const path = await writeBatch("tasks.yaml", "- title: Only\n");

		await createProgram().parseAsync([
			"node",
			"test",
			"--json",
			"create",
			"--from-file",
			path,
		]);

		const parsed = JSON.parse(output.stdout()) as Array<{
			id: string;
			title: string;
		}>;
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.title).toBe("Only");
		expect(exit.calls()).toEqual([]);
	});

	it("emits one task ID per line when --plain is set", async () => {
		const path = await writeBatch("tasks.yaml", "- title: A\n- title: B\n");

		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"create",
			"--from-file",
			path,
		]);

		expect(output.stdout()).toBe("TASK-001\nTASK-002\n");
		expect(exit.calls()).toEqual([]);
	});

	it("rejects combining --from-file with a positional title", async () => {
		const path = await writeBatch("tasks.yaml", "- title: ok\n");

		await expect(
			createProgram().parseAsync([
				"node",
				"test",
				"create",
				"Inline title",
				"--from-file",
				path,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain(
			"Cannot combine positional <title> with --from-file",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("rejects combining --from-file with per-task flags", async () => {
		const path = await writeBatch("tasks.yaml", "- title: ok\n");

		await expect(
			createProgram().parseAsync([
				"node",
				"test",
				"create",
				"--from-file",
				path,
				"--priority",
				"high",
			]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain("Per-task flags");
		expect(exit.calls()).toEqual([1]);
	});

	it("rejects an invalid YAML payload with a helpful error", async () => {
		const path = await writeBatch(
			"bad.yaml",
			"- title: ok\n  labels: [unterminated\n",
		);

		await expect(
			createProgram().parseAsync([
				"node",
				"test",
				"create",
				"--from-file",
				path,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain("Invalid YAML in batch file");
		expect(exit.calls()).toEqual([1]);
	});

	it("rejects a non-array top-level YAML payload", async () => {
		const path = await writeBatch("scalar.yaml", "title: lonely\n");

		await expect(
			createProgram().parseAsync([
				"node",
				"test",
				"create",
				"--from-file",
				path,
			]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain("Batch file must contain a YAML array");
		expect(exit.calls()).toEqual([1]);
	});

	it("exits with an error when --from-file points at a missing file", async () => {
		await expect(
			createProgram().parseAsync([
				"node",
				"test",
				"create",
				"--from-file",
				join(tempDir, "does-not-exist.yaml"),
			]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain("Failed to read");
		expect(exit.calls()).toEqual([1]);
	});
});

describe("task create (no batch)", () => {
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-create-no-args-test-");
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("exits with an error when neither <title> nor --from-file is provided", async () => {
		await expect(
			createProgram().parseAsync(["node", "test", "create"]),
		).rejects.toThrow(ProcessExitError);

		expect(output.stderr()).toContain("Missing required argument: <title>");
		expect(exit.calls()).toEqual([1]);
	});
});

describe("task create adapter internals", () => {
	it("delegates ID allocation to TaskManager without allocation helpers", async () => {
		// @cosmo-behavior plan:task-id-system#B-010
		const source = await readFile(
			new URL("../../../../cli/tasks/commands/create.ts", import.meta.url),
			"utf-8",
		);

		expect(source).toContain("TaskManager");
		expect(source).toContain(".createTask(");
		expect(source).not.toMatch(/\bgenerateNextId\b/);
		expect(source).not.toContain("id-generator");
		expect(source).not.toMatch(/\bloadConfig\b/);
		expect(source).not.toMatch(/\bsaveConfig\b/);
	});
});

function createProgram() {
	return createCommandProgram(registerCreateCommand);
}

async function expectCreateToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

async function expectInvalidPriorityError(
	args: string[],
	output: ReturnType<typeof captureCommandOutput>,
	exit: ReturnType<typeof mockProcessExitThrow>,
): Promise<void> {
	await expectCreateToExit(args);
	expectInvalidPriorityDiagnostics(output, exit);
}

function taskConfigPath(projectRoot: string): string {
	return join(projectRoot, "missions", "tasks", "config.json");
}

async function writeTaskConfig(
	projectRoot: string,
	contents: string,
): Promise<string> {
	const configPath = taskConfigPath(projectRoot);
	await mkdir(join(projectRoot, "missions", "tasks"), { recursive: true });
	await writeFile(configPath, contents, "utf-8");
	return configPath;
}

async function listTaskDirectoryEntries(
	projectRoot: string,
): Promise<string[]> {
	return (await readdir(join(projectRoot, "missions", "tasks"))).sort();
}

async function pathExists(path: string): Promise<boolean> {
	return await access(path)
		.then(() => true)
		.catch(() => false);
}

async function writeEpisodicConfig(projectRoot: string): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		JSON.stringify({ episodicLog: { enabled: true } }),
		"utf-8",
	);
}

async function readProjectEpisodes(projectRoot: string) {
	return (
		await createMarkdownMemoryStore({ projectRoot }).retrieve(
			{ projectRoot, scopes: ["project"] },
			{ text: "", recordTypes: ["episode"] },
		)
	).records;
}
