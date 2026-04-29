import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseTaskListFilter,
	registerListCommand,
	renderTaskList,
	renderTaskRow,
} from "../../../../cli/tasks/commands/list.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../../lib/tasks/task-types.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	expectInvalidStatusDiagnostics,
	expectNoCommandDiagnostics,
	expectSingleJsonTaskTitle,
	type mockProcessExitThrow,
	ProcessExitError,
} from "../../../helpers/cli.ts";
import {
	createInitializedTaskManager,
	createTaskFixture,
	createTaskRecordFixture,
} from "../../../helpers/tasks.ts";

const renderedTask: Task = createTaskRecordFixture();

describe("parseTaskListFilter", () => {
	it("normalizes all filter options", () => {
		expect(
			parseTaskListFilter({
				status: "in-progress",
				priority: "HIGH",
				assignee: "alice",
				label: "plan:demo",
				ready: true,
			}),
		).toEqual({
			ok: true,
			value: {
				status: "In Progress",
				priority: "high",
				assignee: "alice",
				label: "plan:demo",
				hasNoDependencies: true,
			},
		});
	});

	it("rejects invalid status values", () => {
		expect(parseTaskListFilter({ status: "waiting" })).toEqual({
			ok: false,
			error:
				"Invalid status: waiting. Must be one of: todo, in-progress, done, blocked",
		});
	});

	it("rejects invalid priority values", () => {
		expect(parseTaskListFilter({ priority: "urgent" })).toEqual({
			ok: false,
			error: "Invalid priority: urgent. Must be one of: high, medium, low",
		});
	});
});

describe("renderTaskList", () => {
	it("returns tasks for JSON mode", () => {
		expect(renderTaskList([renderedTask], "json")).toEqual([renderedTask]);
	});

	it("returns rows for plain mode", () => {
		expect(renderTaskList([renderedTask], "plain")).toEqual([
			"TASK-001 | To Do | high | Rendered Task",
		]);
	});

	it("returns empty human output", () => {
		expect(renderTaskList([], "human")).toEqual(["No tasks found"]);
	});

	it("returns a human table", () => {
		expect(renderTaskList([renderedTask], "human")).toEqual([
			"ID        STATUS       PRIORITY   TITLE",
			"TASK-001  To Do        high       Rendered Task",
		]);
	});
});

describe("renderTaskRow", () => {
	it("falls back to a dash when priority is missing", () => {
		expect(renderTaskRow({ ...renderedTask, priority: undefined })).toBe(
			"TASK-001 | To Do | - | Rendered Task",
		);
	});
});

describe("task list command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-list-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("prints invalid status errors in human mode", async () => {
		await expectListToExit(["list", "--status", "waiting"]);

		expectInvalidStatusDiagnostics(output, exit);
	});

	it("prints invalid priority errors in human mode", async () => {
		await expectListToExit(["list", "--priority", "urgent"]);

		expect(output.stdout()).toHaveLength(0);
		expect(output.stderr().trim()).toBe(
			"Invalid priority: urgent. Must be one of: high, medium, low",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("maps the ready filter to tasks with no dependencies", async () => {
		const listTasks = vi
			.spyOn(TaskManager.prototype, "listTasks")
			.mockResolvedValue([]);

		await createProgram().parseAsync(["node", "test", "list", "--ready"]);

		expect(listTasks).toHaveBeenCalledWith({ hasNoDependencies: true });
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints empty human output", async () => {
		await createProgram().parseAsync(["node", "test", "list"]);

		expect(output.stdout()).toBe("No tasks found\n");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints table columns in human mode", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, { title: "Build CLI", priority: "high" });

		await createProgram().parseAsync(["node", "test", "list"]);

		const lines = output.stdout().trimEnd().split("\n");
		expect(lines[0]).toBe("ID        STATUS       PRIORITY   TITLE");
		expect(lines[1]).toBe("TASK-001  To Do        high       Build CLI");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints plain output", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, {
			title: "Plain Task",
			priority: "medium",
		});

		await createProgram().parseAsync(["node", "test", "--plain", "list"]);

		expect(output.stdout()).toBe("TASK-001 | To Do | medium | Plain Task\n");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints JSON output", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, { title: "JSON Task", priority: "low" });

		await createProgram().parseAsync(["node", "test", "--json", "list"]);

		expectSingleJsonTaskTitle(output, "JSON Task");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints manager errors in human mode", async () => {
		vi.spyOn(TaskManager.prototype, "listTasks").mockRejectedValue(
			new Error("disk full"),
		);

		await expectListToExit(["list"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error listing tasks: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});
});

function createProgram() {
	return createCommandProgram(registerListCommand);
}

async function expectListToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}
