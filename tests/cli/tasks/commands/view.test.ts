import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	registerViewCommand,
	renderFormattedTask,
	renderTaskDescription,
	renderTaskMetadata,
} from "../../../../cli/tasks/commands/view.ts";
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

const fullTask: Task = {
	id: "TASK-123",
	title: "Full View",
	status: "In Progress",
	priority: "high",
	assignee: "alice",
	labels: ["wave:1", "area:cli"],
	dependencies: ["TASK-001", "TASK-002"],
	dueDate: new Date("2026-05-10T15:30:00.000Z"),
	createdAt: new Date("2026-04-01T12:00:00.000Z"),
	updatedAt: new Date("2026-04-02T13:30:00.000Z"),
	description:
		"Intro line\n\n<!-- AC:BEGIN -->\n- [ ] #1 Hidden criterion\n<!-- AC:END -->\n\nVisible tail",
	implementationPlan: "1. First step\n2. Second step",
	acceptanceCriteria: [
		{ index: 1, text: "Write tests", checked: false },
		{ index: 2, text: "Ship refactor", checked: true },
	],
	implementationNotes: "Started work\nNeeds review",
};

const minimalTask: Task = {
	id: "TASK-124",
	title: "Minimal View",
	status: "To Do",
	labels: [],
	dependencies: [],
	createdAt: new Date("2026-04-03T12:00:00.000Z"),
	updatedAt: new Date("2026-04-04T13:30:00.000Z"),
	acceptanceCriteria: [],
};

const expectedFullDescriptionLines = [
	"Description:",
	"  Intro line",
	"  ",
	"  Visible tail",
];

const expectedFullFormattedLines = [
	"TASK-123: Full View",
	"━━━━━━━━━━━━━━━━━━━━━",
	"",
	"Status: In Progress",
	"Priority: high",
	"Assignee: alice",
	"Labels: wave:1, area:cli",
	"Dependencies: TASK-001, TASK-002",
	"Due Date: 2026-05-10",
	"Created: 2026-04-01",
	"Updated: 2026-04-02",
	"",
	...expectedFullDescriptionLines,
	"",
	"Implementation Plan:",
	"  1. First step",
	"  2. Second step",
	"",
	"Acceptance Criteria:",
	"  [ ] #1 Write tests",
	"  [x] #2 Ship refactor",
	"",
	"Implementation Notes:",
	"  Started work",
	"  Needs review",
];

const expectedMinimalMetadataLines = [
	"Status: To Do",
	"Created: 2026-04-03",
	"Updated: 2026-04-04",
];

const expectedMinimalFormattedLines = [
	"TASK-124: Minimal View",
	"━━━━━━━━━━━━━━━━━━━━━━━━",
	"",
	...expectedMinimalMetadataLines,
];

describe("task view renderers", () => {
	it("renders formatted task sections in order", () => {
		expect(renderFormattedTask(fullTask)).toEqual(expectedFullFormattedLines);
	});

	it("omits metadata lines for absent optional values", () => {
		expect(renderTaskMetadata(minimalTask)).toEqual(
			expectedMinimalMetadataLines,
		);
	});

	it("strips acceptance criteria marker blocks from descriptions", () => {
		expect(renderTaskDescription(fullTask)).toEqual(
			expectedFullDescriptionLines,
		);
	});
});

describe("task view command", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("task-view-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
	});

	afterEach(async () => {
		await context.restore();
	});

	it("prints formatted output for every section", async () => {
		vi.spyOn(TaskManager.prototype, "getTask").mockResolvedValue(fullTask);

		await createProgram().parseAsync(["node", "test", "view", "TASK-123"]);

		expect(normalizeCapturedBlankLines(output.stdout())).toBe(
			`${expectedFullFormattedLines.join("\n")}\n`,
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("omits optional formatted sections when values are absent", async () => {
		vi.spyOn(TaskManager.prototype, "getTask").mockResolvedValue(minimalTask);

		await createProgram().parseAsync(["node", "test", "view", "TASK-124"]);

		expect(normalizeCapturedBlankLines(output.stdout())).toBe(
			`${expectedMinimalFormattedLines.join("\n")}\n`,
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not-found errors in JSON mode", async () => {
		await createInitializedTaskManager(tempDir, "TASK");

		await expectViewToExit(["--json", "view", "TASK-404"]);

		expect(output.stdout()).toContain(
			'{\n  "error": "Error: Task not found: TASK-404"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()[0]).toBe(1);
	});

	it("escapes multiline fields in plain output", async () => {
		vi.spyOn(TaskManager.prototype, "getTask").mockResolvedValue(fullTask);

		await createProgram().parseAsync([
			"node",
			"test",
			"--plain",
			"view",
			"TASK-123",
		]);

		expect(output.stdout()).toBe(
			[
				"id=TASK-123",
				"title=Full View",
				"status=In Progress",
				"priority=high",
				"assignee=alice",
				"labels=wave:1,area:cli",
				"dependencies=TASK-001,TASK-002",
				"created=2026-04-01T12:00:00.000Z",
				"updated=2026-04-02T13:30:00.000Z",
				"dueDate=2026-05-10T15:30:00.000Z",
				"description=Intro line\\n\\nVisible tail",
				"plan=1. First step\\n2. Second step",
				"ac.1=[ ] Write tests",
				"ac.2=[x] Ship refactor",
				"notes=Started work\\nNeeds review",
				"",
			].join("\n"),
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints manager errors in human mode", async () => {
		vi.spyOn(TaskManager.prototype, "getTask").mockRejectedValue(
			new Error("disk full"),
		);

		await expectViewToExit(["view", "TASK-123"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error viewing task: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});
});

function createProgram() {
	return createCommandProgram(registerViewCommand);
}

async function expectViewToExit(args: string[]): Promise<void> {
	await expect(
		createProgram().parseAsync(["node", "test", ...args]),
	).rejects.toThrow(ProcessExitError);
}

function normalizeCapturedBlankLines(output: string): string {
	return output.replace(/^undefined$/gm, "");
}
