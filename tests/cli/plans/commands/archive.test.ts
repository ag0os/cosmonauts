import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archivePlan } from "../../../../lib/plans/archive.ts";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";

describe("plan archive command", () => {
	let tempDir: string;
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-archive-test-"));
		planManager = new PlanManager(tempDir);
		taskManager = new TaskManager(tempDir);
		await taskManager.init({ prefix: "TEST" });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("archives a plan with no tasks", async () => {
		await planManager.createPlan({
			slug: "empty-plan",
			title: "Empty Plan",
		});

		const result = await archivePlan(
			tempDir,
			"empty-plan",
			planManager,
			taskManager,
		);

		expect(result.planSlug).toBe("empty-plan");
		expect(result.archivedTaskFiles).toEqual([]);

		const archived = await stat(result.archivedPlanPath);
		expect(archived.isDirectory()).toBe(true);
	});

	it("archives a plan with done tasks", async () => {
		await planManager.createPlan({
			slug: "done-plan",
			title: "Done Plan",
		});
		const task = await taskManager.createTask({
			title: "Done task",
			labels: ["plan:done-plan"],
		});
		await taskManager.updateTask(task.id, { status: "Done" });

		const result = await archivePlan(
			tempDir,
			"done-plan",
			planManager,
			taskManager,
		);

		expect(result.archivedTaskFiles).toHaveLength(1);
	});

	it("rejects archiving with non-done tasks", async () => {
		await planManager.createPlan({
			slug: "active-plan",
			title: "Active Plan",
		});
		await taskManager.createTask({
			title: "Pending task",
			labels: ["plan:active-plan"],
		});

		await expect(
			archivePlan(tempDir, "active-plan", planManager, taskManager),
		).rejects.toThrow(/tasks not Done/);
	});

	it("rejects archiving non-existent plan", async () => {
		await expect(
			archivePlan(tempDir, "nonexistent", planManager, taskManager),
		).rejects.toThrow(/not found/);
	});
});
