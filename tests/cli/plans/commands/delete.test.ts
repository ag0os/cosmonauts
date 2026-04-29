import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanDeleteResult } from "../../../../cli/plans/commands/delete.ts";
import {
	confirmPlanDeletion,
	loadPlanForDeletion,
	registerDeleteCommand,
	renderPlanDeleteResult,
} from "../../../../cli/plans/commands/delete.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import type { Plan } from "../../../../lib/plans/plan-types.ts";
import {
	type CommandTestContext,
	type captureCommandOutput,
	createCommandProgram,
	createCommandTestContext,
	type mockProcessExitThrow,
	ProcessExitError,
} from "../../../helpers/cli.ts";
import { createPlanFixture } from "../../../helpers/plans.ts";

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

describe("renderPlanDeleteResult", () => {
	const plan: Plan = {
		slug: "rendered-plan",
		title: "Rendered Plan",
		status: "active",
		createdAt: new Date("2026-01-01"),
		updatedAt: new Date("2026-01-01"),
		body: "Render body",
	};

	it("returns deleted JSON output", () => {
		const result: PlanDeleteResult = { status: "deleted", plan };

		expect(renderPlanDeleteResult(result, "json")).toEqual({
			deleted: true,
			slug: "rendered-plan",
			title: "Rendered Plan",
		});
	});

	it("returns deleted plain output", () => {
		expect(
			renderPlanDeleteResult({ status: "deleted", plan }, "plain"),
		).toEqual(["deleted rendered-plan"]);
	});

	it("returns deleted human output", () => {
		expect(
			renderPlanDeleteResult({ status: "deleted", plan }, "human"),
		).toEqual(["Deleted plan rendered-plan: Rendered Plan"]);
	});

	it("returns cancelled JSON output", () => {
		const result: PlanDeleteResult = { status: "cancelled", plan };

		expect(renderPlanDeleteResult(result, "json")).toEqual({
			cancelled: true,
			slug: "rendered-plan",
		});
	});

	it("returns cancelled plain output", () => {
		expect(
			renderPlanDeleteResult({ status: "cancelled", plan }, "plain"),
		).toEqual(["cancelled"]);
	});

	it("returns cancelled human output", () => {
		expect(
			renderPlanDeleteResult({ status: "cancelled", plan }, "human"),
		).toEqual(["Deletion cancelled."]);
	});
});

describe("plan delete CLI", () => {
	let tempDir: string;
	let output: ReturnType<typeof captureCommandOutput>;
	let exit: ReturnType<typeof mockProcessExitThrow>;
	let context: CommandTestContext;

	beforeEach(async () => {
		context = await createCommandTestContext("plan-delete-command-test-");
		tempDir = context.tempDir;
		output = context.output;
		exit = context.exit;
		readlineMocks.close.mockReset();
		readlineMocks.question.mockReset();
	});

	afterEach(async () => {
		await context.restore();
	});

	it("force deletes a plan in human mode without prompting", async () => {
		const { manager, plan } = await createPlanInTempDir(
			tempDir,
			"remove-me",
			"Remove Me",
		);

		await createProgram().parseAsync([
			"node",
			"test",
			"delete",
			plan.slug,
			"--force",
		]);

		await expect(manager.getPlan(plan.slug)).resolves.toBeNull();
		expect(readlineMocks.question).not.toHaveBeenCalled();
		expect(output.stdout()).toBe("Deleted plan remove-me: Remove Me\n");
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([]);
	});

	it("prints not found errors in JSON mode", async () => {
		await expectDeleteToExit(["--json", "delete", "missing-plan", "--force"]);

		expect(output.stdout()).toContain(
			'{\n  "error": "Plan not found: missing-plan"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints not found errors in human mode", async () => {
		await expectDeleteToExit(["delete", "missing-plan", "--force"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toContain("Error: Plan not found: missing-plan\n");
		expect(exit.calls()[0]).toBe(1);
	});

	it("prints cancellation in JSON mode without deleting", async () => {
		await expectCancelledDeletion({
			tempDir,
			answer: "n",
			modeArgs: ["--json"],
			expectedStdout: '{\n  "cancelled": true,\n  "slug": "keep-me"\n}\n',
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
		await createPlanInTempDir(tempDir, "delete-fails", "Delete Fails");
		mockDeletePlanFailure();

		await expectDeleteToExit(["--json", "delete", "delete-fails", "--force"]);

		expect(output.stdout()).toBe(
			'{\n  "error": "Error deleting plan: Error: disk full"\n}\n',
		);
		expect(output.stderr()).toBe("");
		expect(exit.calls()).toEqual([1]);
	});

	it("prints manager errors in human mode", async () => {
		await createPlanInTempDir(tempDir, "delete-fails", "Delete Fails");
		mockDeletePlanFailure();

		await expectDeleteToExit(["delete", "delete-fails", "--force"]);

		expect(output.stdout()).toBe("");
		expect(output.stderr()).toBe("Error deleting plan: Error: disk full\n");
		expect(exit.calls()).toEqual([1]);
	});

	it("loads an existing plan for deletion", async () => {
		const { manager, plan } = await createPlanInTempDir(
			tempDir,
			"load-me",
			"Load Me",
		);

		await expect(loadPlanForDeletion(manager, plan.slug)).resolves.toEqual({
			ok: true,
			value: plan,
		});
	});

	it("returns a parse error when the plan cannot be loaded", async () => {
		const manager = new PlanManager(tempDir);

		await expect(loadPlanForDeletion(manager, "missing-plan")).resolves.toEqual(
			{
				ok: false,
				error: "Plan not found: missing-plan",
			},
		);
	});

	it("confirms deletion without prompting when force is set", async () => {
		const { plan } = await createPlanInTempDir(tempDir, "forced", "Forced");

		await expect(confirmPlanDeletion(plan, true)).resolves.toBe(true);
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

async function createPlanInTempDir(
	tempDir: string,
	slug: string,
	title: string,
): Promise<{ manager: PlanManager; plan: Plan }> {
	const manager = new PlanManager(tempDir);
	const plan = await createPlanFixture(manager, { slug, title });
	return { manager, plan };
}

function mockDeletePlanFailure(): void {
	vi.spyOn(PlanManager.prototype, "deletePlan").mockRejectedValue(
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
	const { manager, plan } = await createPlanInTempDir(
		tempDir,
		"keep-me",
		"Keep Me",
	);
	answerPrompt(answer);
	const deletePlan = vi.spyOn(PlanManager.prototype, "deletePlan");

	await createProgram().parseAsync([
		"node",
		"test",
		...modeArgs,
		"delete",
		plan.slug,
	]);

	await expect(manager.getPlan(plan.slug)).resolves.not.toBeNull();
	expect(deletePlan).not.toHaveBeenCalled();
	expect(output.stdout()).toBe(expectedStdout);
	expect(output.stderr()).toBe("");
	expect(exit.calls()).toEqual([]);
}
