import "../../../helpers/readline.ts";
import { describe, expect, it, vi } from "vitest";
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
	runCommonDeleteCommandTests,
	setupDeleteCommandContext,
} from "../../../helpers/delete-command-tests.ts";
import { createPlanFixture } from "../../../helpers/plans.ts";
import { getReadlineMocks } from "../../../helpers/readline.ts";

const readlineMocks = getReadlineMocks();

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
	const getContext = setupDeleteCommandContext("plan-delete-command-test-");

	runCommonDeleteCommandTests<Plan, PlanManager>({
		entityName: "plan",
		registerDeleteCommand,
		getContext,
		forceCase: {
			create: async (tempDir) => {
				const { manager, plan } = await createPlanInTempDir(
					tempDir,
					"remove-me",
					"Remove Me",
				);
				return { manager, entity: plan };
			},
			id: (plan) => plan.slug,
			get: (manager, slug) => manager.getPlan(slug),
			args: (plan) => ["delete", plan.slug, "--force"],
			expectedStdout: "Deleted plan remove-me: Remove Me\n",
		},
		notFound: {
			id: "missing-plan",
			jsonError: '{\n  "error": "Plan not found: missing-plan"\n}\n',
			humanError: "Error: Plan not found: missing-plan\n",
		},
		cancellation: {
			create: async (tempDir) => {
				const { manager, plan } = await createPlanInTempDir(
					tempDir,
					"keep-me",
					"Keep Me",
				);
				return { manager, entity: plan };
			},
			id: (plan) => plan.slug,
			get: (manager, slug) => manager.getPlan(slug),
			spyOnDelete: () => vi.spyOn(PlanManager.prototype, "deletePlan"),
			jsonStdout: '{\n  "cancelled": true,\n  "slug": "keep-me"\n}\n',
		},
		managerError: {
			create: async (tempDir) => {
				await createPlanInTempDir(tempDir, "delete-fails", "Delete Fails");
			},
			mockFailure: mockDeletePlanFailure,
			id: "delete-fails",
			jsonStdout: '{\n  "error": "Error deleting plan: Error: disk full"\n}\n',
			humanStderr: "Error deleting plan: Error: disk full\n",
		},
	});

	it("loads an existing plan for deletion", async () => {
		const { tempDir } = getContext();
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
		const { tempDir } = getContext();
		const manager = new PlanManager(tempDir);

		await expect(loadPlanForDeletion(manager, "missing-plan")).resolves.toEqual(
			{
				ok: false,
				error: "Plan not found: missing-plan",
			},
		);
	});

	it("confirms deletion without prompting when force is set", async () => {
		const { tempDir } = getContext();
		const { plan } = await createPlanInTempDir(tempDir, "forced", "Forced");

		await expect(confirmPlanDeletion(plan, true)).resolves.toBe(true);
		expect(readlineMocks.question).not.toHaveBeenCalled();
	});
});

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
