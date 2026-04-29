import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDeleteResult } from "../../../../cli/tasks/commands/delete.ts";
import {
	confirmTaskDeletion,
	loadTaskForDeletion,
	registerDeleteCommand,
	renderTaskDeleteResult,
} from "../../../../cli/tasks/commands/delete.ts";
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

const readlineMocks = vi.hoisted(() => ({
	close: vi.fn<() => void>(),
	question:
		vi.fn<(query: string, callback: (answer: string) => void) => void>(),
}));

vi.mock("node:readline", () => ({
	createInterface: () => ({
		close: readlineMocks.close,
		question: readlineMocks.question,
	}),
}));

describe("renderTaskDeleteResult", () => {
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

	it("returns deleted JSON output", () => {
		const result: TaskDeleteResult = { status: "deleted", task };

		expect(renderTaskDeleteResult(result, "json")).toEqual({
			deleted: true,
			id: "TASK-001",
			title: "Rendered Task",
		});
	});

	it("returns deleted plain output", () => {
		expect(
			renderTaskDeleteResult({ status: "deleted", task }, "plain"),
		).toEqual(["deleted TASK-001"]);
	});

	it("returns deleted human output", () => {
		expect(
			renderTaskDeleteResult({ status: "deleted", task }, "human"),
		).toEqual(["Deleted task TASK-001: Rendered Task"]);
	});

	it("returns cancelled JSON output", () => {
		const result: TaskDeleteResult = { status: "cancelled", task };

		expect(renderTaskDeleteResult(result, "json")).toEqual({
			cancelled: true,
			id: "TASK-001",
		});
	});

	it("returns cancelled plain output", () => {
		expect(
			renderTaskDeleteResult({ status: "cancelled", task }, "plain"),
		).toEqual(["cancelled"]);
	});

	it("returns cancelled human output", () => {
		expect(
			renderTaskDeleteResult({ status: "cancelled", task }, "human"),
		).toEqual(["Deletion cancelled."]);
	});
});

describe("task delete command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-delete-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
		readlineMocks.close.mockReset();
		readlineMocks.question.mockReset();
	});

	afterEach(async () => {
		await context.restore();
	});

	it("force deletes a task in human mode without prompting", async () => {
		const { manager } = await createTaskInTempDir(tempDir, "Remove Me");

		await createProgram().parseAsync([
			"node",
			"test",
			"delete",
			"TASK-001",
			"--force",
		]);

		await expect(manager.getTask("TASK-001")).resolves.toBeNull();
		expect(readlineMocks.question).not.toHaveBeenCalled();
		expect(output.stdout()).toBe("Deleted task TASK-001: Remove Me\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not found errors in JSON mode", async () => {
		await createInitializedTaskManager(tempDir, "TASK");

		await expectDeleteToExit(["--json", "delete", "TASK-404", "--force"]);

		expect(output.stdout()).toContain(
			'{\n  "error": "Task not found: TASK-404"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints not found errors in human mode", async () => {
		await createInitializedTaskManager(tempDir, "TASK");

		await expectDeleteToExit(["delete", "TASK-404", "--force"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toContain("Error: Task not found: TASK-404\n");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints cancellation in JSON mode without deleting", async () => {
		await expectCancelledDeletion({
			tempDir,
			answer: "n",
			modeArgs: ["--json"],
			expectedStdout: '{\n  "cancelled": true,\n  "id": "TASK-001"\n}\n',
			output,
			exit,
		});
	});

	it("prints cancellation in plain mode without deleting", async () => {
		await expectCancelledDeletion({
			tempDir,
			answer: "no",
			modeArgs: ["--plain"],
			expectedStdout: "cancelled\n",
			output,
			exit,
		});
	});

	it("prints cancellation in human mode without deleting", async () => {
		await expectCancelledDeletion({
			tempDir,
			answer: "",
			modeArgs: [],
			expectedStdout: "Deletion cancelled.\n",
			output,
			exit,
		});
	});

	it("prints manager errors in JSON mode", async () => {
		await createTaskInTempDir(tempDir, "Delete Fails");
		mockDeleteTaskFailure();

		await expectDeleteToExit(["--json", "delete", "TASK-001", "--force"]);

		expect(output.stdout()).toBe(
			'{\n  "error": "Error deleting task: Error: disk full"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("prints manager errors in human mode", async () => {
		await createTaskInTempDir(tempDir, "Delete Fails");
		mockDeleteTaskFailure();

		await expectDeleteToExit(["delete", "TASK-001", "--force"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error deleting task: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});

	it("loads an existing task for deletion", async () => {
		const { manager, task } = await createTaskInTempDir(tempDir, "Load Me");

		await expect(loadTaskForDeletion(manager, task.id)).resolves.toEqual({
			ok: true,
			value: task,
		});
	});

	it("returns a parse error when the task cannot be loaded", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");

		await expect(loadTaskForDeletion(manager, "TASK-404")).resolves.toEqual({
			ok: false,
			error: "Task not found: TASK-404",
		});
	});

	it("confirms deletion without prompting when force is set", async () => {
		const { task } = await createTaskInTempDir(tempDir, "Forced");

		await expect(confirmTaskDeletion(task, true)).resolves.toBe(true);
		expect(readlineMocks.question).not.toHaveBeenCalled();
	});
});

function createProgram() {
	return createCommandProgram(registerDeleteCommand);
}

async function expectDeleteToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

function answerPrompt(answer: string): void {
	readlineMocks.question.mockImplementation((_query, callback) => {
		callback(answer);
	});
}

async function createTaskInTempDir(
	tempDir: string,
	title: string,
): Promise<{ manager: TaskManager; task: Task }> {
	const manager = await createInitializedTaskManager(tempDir, "TASK");
	const task = await createTaskFixture(manager, { title });
	return { manager, task };
}

function mockDeleteTaskFailure(): void {
	vi.spyOn(TaskManager.prototype, "deleteTask").mockRejectedValue(
		new Error("disk full"),
	);
}

interface CancelledDeletionExpectation {
	tempDir: string;
	answer: string;
	modeArgs: string[];
	expectedStdout: string;
	output: ReturnType<typeof captureCommandOutput>;
	exit: ReturnType<typeof mockProcessExitThrow>;
}

async function expectCancelledDeletion({
	tempDir,
	answer,
	modeArgs,
	expectedStdout,
	output,
	exit,
}: CancelledDeletionExpectation): Promise<void> {
	const { manager, task } = await createTaskInTempDir(tempDir, "Keep Me");
	answerPrompt(answer);
	const deleteTask = vi.spyOn(TaskManager.prototype, "deleteTask");

	await createProgram().parseAsync([
		"node",
		"test",
		...modeArgs,
		"delete",
		task.id,
	]);

	await expect(manager.getTask(task.id)).resolves.not.toBeNull();
	expect(deleteTask).not.toHaveBeenCalled();
	expect(output.stdout()).toBe(expectedStdout);
	expect(output.stderr()).toBe("");
	expect(exit.calls()).toEqual([]);
}
