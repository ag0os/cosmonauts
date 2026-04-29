import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	AcceptanceCriterionEditOptions,
	DependencyEditOptions,
	FieldChange,
	LabelEditOptions,
	TaskEditCliOptions,
} from "../../../../cli/tasks/commands/edit.ts";
import {
	applyAcceptanceCriterionEdits,
	applyTaskDependencyEdits,
	applyTaskLabelEdits,
	buildTaskUpdate,
	registerEditCommand,
	renderTaskEditSuccess,
} from "../../../../cli/tasks/commands/edit.ts";
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
import {
	createInitializedTaskManager,
	createTaskFixture,
} from "../../../helpers/tasks.ts";

const renderedTask: Task = {
	id: "TASK-001",
	title: "Rendered Task",
	status: "To Do",
	createdAt: new Date("2026-01-01"),
	updatedAt: new Date("2026-01-01"),
	labels: ["area:cli"],
	dependencies: ["TASK-000"],
	acceptanceCriteria: [{ index: 1, text: "Ship", checked: false }],
};

describe("task edit helpers", () => {
	it("builds normalized update input and tracks changes", () => {
		const options: TaskEditCliOptions = {
			title: "Updated Task",
			status: "in-progress",
			priority: "HIGH",
			due: "2026-05-01",
			appendPlan: "Next\\nstep",
		};
		const result = buildTaskUpdate(renderedTask, options);

		expect(result).toEqual({
			ok: true,
			value: {
				updateInput: {
					title: "Updated Task",
					status: "In Progress",
					priority: "high",
					dueDate: new Date("2026-05-01"),
					implementationPlan: "Next\nstep",
				},
				changes: [
					{
						field: "title",
						oldValue: "Rendered Task",
						newValue: "Updated Task",
					},
					{ field: "status", oldValue: "To Do", newValue: "In Progress" },
					{ field: "priority", oldValue: "none", newValue: "high" },
					{ field: "dueDate", oldValue: "none", newValue: "2026-05-01" },
					{ field: "plan", oldValue: "", newValue: "" },
				],
			},
		});
	});

	it("returns parse errors for invalid update options and no changes", () => {
		expect(buildTaskUpdate(renderedTask, { status: "waiting" })).toEqual({
			ok: false,
			error:
				"Invalid status: waiting. Must be one of: todo, in-progress, done, blocked",
		});
		expect(buildTaskUpdate(renderedTask, {})).toEqual({
			ok: false,
			error: "No changes specified. Use --help to see available options.",
		});
	});

	it("applies label and dependency edits case-insensitively", () => {
		const labelEdits: LabelEditOptions = {
			removeLabels: ["old"],
			addLabels: ["KEEP", "New"],
		};
		const dependencyEdits: DependencyEditOptions = {
			removeDependencies: ["TASK-020"],
			addDependencies: ["task-010", "TASK-030"],
		};

		expect(applyTaskLabelEdits(["Keep", "Old"], labelEdits)).toEqual([
			"Keep",
			"New",
		]);
		expect(
			applyTaskDependencyEdits(["TASK-010", "task-020"], dependencyEdits),
		).toEqual(["TASK-010", "TASK-030"]);
	});

	it("applies acceptance criterion edits in remove, reindex, add, check order", () => {
		const edits: AcceptanceCriterionEditOptions = {
			removeIndices: [2],
			addCriteria: ["Fourth"],
			checkIndices: [2],
			uncheckIndices: [1],
		};

		expect(
			applyAcceptanceCriterionEdits(
				[
					{ index: 1, text: "First", checked: true },
					{ index: 2, text: "Second", checked: false },
					{ index: 3, text: "Third", checked: false },
				],
				edits,
			),
		).toEqual([
			{ index: 1, text: "First", checked: false },
			{ index: 2, text: "Third", checked: true },
			{ index: 3, text: "Fourth", checked: false },
		]);
	});

	it("renders JSON, plain, and human success output", () => {
		const changes: FieldChange[] = [
			{
				field: "title",
				oldValue: "Old Task",
				newValue: "Rendered Task",
			},
		];

		expect(renderTaskEditSuccess(renderedTask, {}, [], "json")).toBe(
			renderedTask,
		);
		expect(
			renderTaskEditSuccess(
				renderedTask,
				{ status: "Done", labels: ["area:cli", "done"] },
				[],
				"plain",
			),
		).toEqual(["updated TASK-001", "status=Done", "labels=area:cli,done"]);
		expect(
			renderTaskEditSuccess(
				renderedTask,
				{ title: "Rendered Task" },
				changes,
				"human",
			),
		).toEqual([
			"Updated task TASK-001: Rendered Task",
			"Changed: title (Old Task → Rendered Task)",
		]);
	});
});

describe("task edit command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-edit-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("prints invalid status errors", async () => {
		await createExistingTask(tempDir);

		await expectEditToExit(["edit", "TASK-001", "--status", "waiting"]);

		expect(output.stderr()).toContain(
			"Error: Invalid status: waiting. Must be one of: todo, in-progress, done, blocked\n",
		);
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints invalid priority errors", async () => {
		await createExistingTask(tempDir);

		await expectEditToExit(["edit", "TASK-001", "--priority", "urgent"]);

		expect(output.stderr()).toContain(
			"Error: Invalid priority: urgent. Must be one of: high, medium, low\n",
		);
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints invalid due date errors in JSON mode", async () => {
		await createExistingTask(tempDir);

		await expectEditToExit([
			"--json",
			"edit",
			"TASK-001",
			"--due",
			"not-a-date",
		]);

		expect(output.stdout()).toContain(
			'{\n  "error": "Invalid date format: not-a-date. Use YYYY-MM-DD format."\n}\n',
		);
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints no-change errors", async () => {
		await createExistingTask(tempDir);

		await expectEditToExit(["edit", "TASK-001"]);

		expect(output.stderr()).toContain(
			"Error: No changes specified. Use --help to see available options.\n",
		);
		expect(exit.calls()[0]).toBe(1);
	});

	it("processes escaped newlines for description, plan, and notes", async () => {
		const manager = await createExistingTask(tempDir);

		await createProgram().parseAsync([
			"node",
			"test",
			"edit",
			"TASK-001",
			"--description",
			"First line\\nSecond line",
			"--plan",
			"Plan one\\nPlan two",
			"--notes",
			"Note one\\nNote two",
		]);

		const task = await manager.getTask("TASK-001");
		expect(task?.description).toBe("First line\nSecond line");
		expect(task?.implementationPlan).toBe("Plan one\nPlan two");
		expect(task?.implementationNotes).toBe("Note one\nNote two");
		expect(output.stdout()).toContain("Updated task TASK-001");
		expect(exit.calls()).toEqual([]);
	});

	it("appends plan and notes with blank-line separators", async () => {
		const manager = await createExistingTask(tempDir);
		await manager.updateTask("TASK-001", {
			implementationPlan: "Existing plan",
			implementationNotes: "Existing notes",
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"edit",
			"TASK-001",
			"--append-plan",
			"Next plan\\nline",
			"--append-notes",
			"Next notes",
		]);

		const task = await manager.getTask("TASK-001");
		expect(task?.implementationPlan).toBe("Existing plan\n\nNext plan\nline");
		expect(task?.implementationNotes).toBe("Existing notes\n\nNext notes");
		expect(exit.calls()).toEqual([]);
	});

	it("adds and removes labels case-insensitively", async () => {
		const manager = await createExistingTask(tempDir, {
			labels: ["Keep", "Old", "Area:CLI"],
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"edit",
			"TASK-001",
			"--remove-label",
			"old",
			"--add-label",
			"KEEP",
			"--add-label",
			"New",
		]);

		const task = await manager.getTask("TASK-001");
		expect(task?.labels).toEqual(["Keep", "Area:CLI", "New"]);
		expect(exit.calls()).toEqual([]);
	});

	it("adds and removes dependencies case-insensitively", async () => {
		const manager = await createExistingTask(tempDir, {
			dependencies: ["TASK-010", "task-020"],
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"edit",
			"TASK-001",
			"--remove-dep",
			"TASK-020",
			"--add-dep",
			"task-010",
			"--add-dep",
			"TASK-030",
		]);

		const task = await manager.getTask("TASK-001");
		expect(task?.dependencies).toEqual(["TASK-010", "TASK-030"]);
		expect(exit.calls()).toEqual([]);
	});

	it("removes, reindexes, adds, checks, and unchecks acceptance criteria", async () => {
		const manager = await createExistingTask(tempDir, {
			acceptanceCriteria: ["First", "Second", "Third"],
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"edit",
			"TASK-001",
			"--remove-ac",
			"2",
			"--add-ac",
			"Fourth",
			"--check-ac",
			"2",
			"--uncheck-ac",
			"1",
		]);

		const task = await manager.getTask("TASK-001");
		expect(task?.acceptanceCriteria).toEqual([
			{ index: 1, text: "First", checked: false },
			{ index: 2, text: "Third", checked: true },
			{ index: 3, text: "Fourth", checked: false },
		]);
		expect(exit.calls()).toEqual([]);
	});

	it("prints changed fields in plain mode", async () => {
		await createExistingTask(tempDir);

		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"edit",
			"TASK-001",
			"--status",
			"done",
			"--priority",
			"HIGH",
			"--title",
			"Plain Updated",
			"--assignee",
			"alice",
			"--due",
			"2026-05-01",
			"--add-label",
			"one",
			"--add-dep",
			"TASK-123",
		]);

		expect(output.stdout()).toBe(
			[
				"updated TASK-001",
				"status=Done",
				"priority=high",
				"title=Plain Updated",
				"assignee=alice",
				"dueDate=2026-05-01",
				"labels=one",
				"dependencies=TASK-123",
				"",
			].join("\n"),
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints JSON output", async () => {
		await createExistingTask(tempDir);

		await createProgram().parseAsync([
			"node",
			"test",
			"--json",
			"edit",
			"TASK-001",
			"--title",
			"JSON Updated",
		]);

		const task = JSON.parse(output.stdout()) as { id: string; title: string };
		expect(task).toMatchObject({ id: "TASK-001", title: "JSON Updated" });
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not-found errors", async () => {
		await createInitializedTaskManager(tempDir, "TASK");

		await expectEditToExit(["edit", "TASK-404", "--title", "Missing"]);

		expect(output.stderr()).toContain("Error: Task not found: TASK-404\n");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints manager errors", async () => {
		await createExistingTask(tempDir);
		vi.spyOn(TaskManager.prototype, "updateTask").mockRejectedValue(
			new Error("disk full"),
		);

		await expectEditToExit(["edit", "TASK-001", "--title", "Failure"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error updating task: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});
});

function createProgram() {
	return createCommandProgram(registerEditCommand);
}

async function expectEditToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

async function createExistingTask(
	projectRoot: string,
	overrides: Parameters<typeof createTaskFixture>[1] = {},
): Promise<TaskManager> {
	const manager = await createInitializedTaskManager(projectRoot, "TASK");
	await createTaskFixture(manager, {
		title: "Existing Task",
		...overrides,
	});
	return manager;
}
