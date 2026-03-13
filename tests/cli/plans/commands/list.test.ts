import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";

describe("plan list command", () => {
	let tempDir: string;
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-list-test-"));
		planManager = new PlanManager(tempDir);
		taskManager = new TaskManager(tempDir);
		await taskManager.init({ prefix: "TEST" });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns empty list when no plans exist", async () => {
		const plans = await planManager.listPlans();
		expect(plans).toEqual([]);
	});

	it("lists all plans", async () => {
		await planManager.createPlan({ slug: "plan-a", title: "Plan A" });
		await planManager.createPlan({ slug: "plan-b", title: "Plan B" });

		const plans = await planManager.listPlans();
		expect(plans).toHaveLength(2);
	});

	it("filters by status", async () => {
		await planManager.createPlan({ slug: "active-plan", title: "Active" });
		await planManager.createPlan({
			slug: "completed-plan",
			title: "Completed",
		});
		await planManager.updatePlan("completed-plan", { status: "completed" });

		const active = await planManager.listPlans("active");
		expect(active).toHaveLength(1);
		expect(active[0]?.slug).toBe("active-plan");

		const completed = await planManager.listPlans("completed");
		expect(completed).toHaveLength(1);
		expect(completed[0]?.slug).toBe("completed-plan");
	});

	it("gets plan summary with task count", async () => {
		await planManager.createPlan({ slug: "counted", title: "Counted" });
		await taskManager.createTask({
			title: "Task 1",
			labels: ["plan:counted"],
		});
		await taskManager.createTask({
			title: "Task 2",
			labels: ["plan:counted"],
		});

		const summary = await planManager.getPlanSummary("counted", taskManager);
		expect(summary).not.toBeNull();
		expect(summary?.taskCount).toBe(2);
	});
});
