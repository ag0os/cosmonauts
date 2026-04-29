import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
	expect(output.stdout()).toBe("");
	expect(output.stderr()).toBe(
		"Invalid priority: urgent. Must be one of: high, medium, low\n",
	);
	expect(exit.calls()).toEqual([1]);
}
