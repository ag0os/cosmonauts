import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseTaskSearchOptions,
	rankTaskSearchResults,
	registerSearchCommand,
	renderTaskSearchResults,
	scoreTaskForQuery,
} from "../../../../cli/tasks/commands/search.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";
import type { Task } from "../../../../lib/tasks/task-types.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	expectInvalidPriorityDiagnostics,
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

describe("parseTaskSearchOptions", () => {
	it("normalizes filters and limit", () => {
		expect(
			parseTaskSearchOptions({
				status: "done",
				priority: "HIGH",
				label: "backend",
				limit: "3",
			}),
		).toEqual({
			ok: true,
			value: {
				filter: {
					status: "Done",
					priority: "high",
					label: "backend",
				},
				limit: 3,
			},
		});
	});

	it("defaults to no filter and a limit of ten", () => {
		expect(parseTaskSearchOptions({})).toEqual({
			ok: true,
			value: {
				filter: undefined,
				limit: 10,
			},
		});
	});

	it("rejects invalid status values", () => {
		expect(parseTaskSearchOptions({ status: "waiting" })).toEqual({
			ok: false,
			error:
				"Invalid status: waiting. Must be one of: todo, in-progress, done, blocked",
		});
	});

	it("rejects invalid priority values", () => {
		expect(parseTaskSearchOptions({ priority: "urgent" })).toEqual({
			ok: false,
			error: "Invalid priority: urgent. Must be one of: high, medium, low",
		});
	});

	it("rejects invalid limits", () => {
		expect(parseTaskSearchOptions({ limit: "0" })).toEqual({
			ok: false,
			error: "Invalid limit: 0. Must be a positive number",
		});
	});
});

describe("scoreTaskForQuery", () => {
	it("weights exact title matches above title prefix and contains matches", () => {
		const exactScore = scoreTaskForQuery(
			{ ...renderedTask, title: "auth" },
			"auth",
		);
		const prefixScore = scoreTaskForQuery(
			{ ...renderedTask, title: "auth service" },
			"auth",
		);
		const containsScore = scoreTaskForQuery(
			{ ...renderedTask, title: "Build auth middleware" },
			"auth",
		);

		expect(exactScore).toBeGreaterThan(prefixScore);
		expect(prefixScore).toBeGreaterThan(containsScore);
	});
});

describe("rankTaskSearchResults", () => {
	it("sorts by score and applies the limit", () => {
		const containsTask = {
			...renderedTask,
			id: "TASK-001",
			title: "Build auth",
		};
		const prefixTask = {
			...renderedTask,
			id: "TASK-002",
			title: "auth service",
		};
		const exactTask = { ...renderedTask, id: "TASK-003", title: "auth" };

		expect(
			rankTaskSearchResults([containsTask, prefixTask, exactTask], "auth", 2),
		).toEqual([exactTask, prefixTask]);
	});
});

describe("renderTaskSearchResults", () => {
	it("returns tasks for JSON mode", () => {
		expect(renderTaskSearchResults([renderedTask], "rendered", "json")).toEqual(
			[renderedTask],
		);
	});

	it("returns rows for plain mode", () => {
		expect(
			renderTaskSearchResults([renderedTask], "rendered", "plain"),
		).toEqual(["TASK-001 | To Do | high | Rendered Task"]);
	});

	it("returns empty human output", () => {
		expect(renderTaskSearchResults([], "missing", "human")).toEqual([
			'No tasks found matching "missing"',
		]);
	});

	it("returns a human table with the result summary", () => {
		expect(
			renderTaskSearchResults([renderedTask], "rendered", "human"),
		).toEqual([
			'Found 1 task(s) matching "rendered":',
			"",
			"ID        STATUS       PRIORITY   TITLE",
			"TASK-001  To Do        high       Rendered Task",
		]);
	});
});

describe("task search command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-search-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("ranks exact title matches before title prefix and contains matches", async () => {
		await runPlainAuthSearch();

		const lines = output.stdout().trimEnd().split("\n");
		expect(lines).toEqual([
			"TASK-003 | To Do | - | auth",
			"TASK-002 | To Do | - | auth service",
			"TASK-001 | To Do | - | Build auth middleware",
		]);
		expectNoCommandDiagnostics(output, exit);
	});

	it("applies the result limit after ranking", async () => {
		await runPlainAuthSearch("--limit", "2");

		expect(output.stdout()).toBe(
			"TASK-003 | To Do | - | auth\nTASK-002 | To Do | - | auth service\n",
		);
		expectNoCommandDiagnostics(output, exit);
	});

	async function runPlainAuthSearch(...extraArgs: string[]): Promise<void> {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, { title: "Build auth middleware" });
		await createTaskFixture(manager, { title: "auth service" });
		await createTaskFixture(manager, { title: "auth" });

		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"search",
			"auth",
			...extraArgs,
		]);
	}

	it("prints invalid status errors in human mode", async () => {
		await expectSearchToExit(["search", "auth", "--status", "waiting"]);

		expectInvalidStatusDiagnostics(output, exit);
	});

	it("prints invalid priority errors in human mode", async () => {
		await expectSearchToExit(["search", "auth", "--priority", "urgent"]);

		expectInvalidPriorityDiagnostics(output, exit);
	});

	it("prints invalid limit errors in human mode", async () => {
		await expectSearchToExit(["search", "auth", "--limit", "0"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe(
			"Invalid limit: 0. Must be a positive number\n",
		);
		expect(exit.calls()).toEqual([1]);
	});

	it("prints empty human output", async () => {
		await createInitializedTaskManager(tempDir, "TASK");

		await createProgram().parseAsync(["node", "test", "search", "missing"]);

		expect(output.stdout()).toBe('No tasks found matching "missing"\n');
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints table output in human mode", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, {
			title: "Build search",
			priority: "medium",
		});

		await createProgram().parseAsync(["node", "test", "search", "search"]);

		expect(normalizeCapturedBlankLines(output.stdout())).toBe(
			'Found 1 task(s) matching "search":\n\nID        STATUS       PRIORITY   TITLE\nTASK-001  To Do        medium     Build search\n',
		);
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints plain output", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, {
			title: "Plain search",
			priority: "low",
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"search",
			"search",
		]);

		expect(output.stdout()).toBe("TASK-001 | To Do | low | Plain search\n");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints JSON output", async () => {
		const manager = await createInitializedTaskManager(tempDir, "TASK");
		await createTaskFixture(manager, {
			title: "JSON search",
			priority: "high",
		});

		await createProgram().parseAsync([
			"node",
			"test",
			"--json",
			"search",
			"search",
		]);

		expectSingleJsonTaskTitle(output, "JSON search");
		expectNoCommandDiagnostics(output, exit);
	});

	it("prints manager errors in human mode", async () => {
		vi.spyOn(TaskManager.prototype, "search").mockRejectedValue(
			new Error("disk full"),
		);

		await expectSearchToExit(["search", "auth"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error searching tasks: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});
});

function createProgram() {
	return createCommandProgram(registerSearchCommand);
}

async function expectSearchToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

function normalizeCapturedBlankLines(value: string): string {
	return value.replaceAll("\nundefined\n", "\n\n");
}
