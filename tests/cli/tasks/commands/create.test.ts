import { writeFile } from "node:fs/promises";
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
