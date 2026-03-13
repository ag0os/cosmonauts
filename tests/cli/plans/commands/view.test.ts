import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanManager } from "../../../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../../../lib/tasks/task-manager.ts";

describe("plan view command", () => {
	let tempDir: string;
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "plan-view-test-"));
		planManager = new PlanManager(tempDir);
		taskManager = new TaskManager(tempDir);
		await taskManager.init({ prefix: "TEST" });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("returns null for non-existent plan", async () => {
		const plan = await planManager.getPlan("nonexistent");
		expect(plan).toBeNull();
	});

	it("retrieves a plan with all fields", async () => {
		await planManager.createPlan({
			slug: "test-view",
			title: "Test View",
			description: "Description body",
			spec: "Spec content",
		});

		const plan = await planManager.getPlan("test-view");
		expect(plan).not.toBeNull();
		expect(plan?.slug).toBe("test-view");
		expect(plan?.title).toBe("Test View");
		expect(plan?.body).toBe("Description body");
		expect(plan?.spec).toBe("Spec content");
	});

	it("gets summary with task count", async () => {
		await planManager.createPlan({ slug: "with-tasks", title: "With Tasks" });
		await taskManager.createTask({
			title: "Linked task",
			labels: ["plan:with-tasks"],
		});

		const summary = await planManager.getPlanSummary("with-tasks", taskManager);
		expect(summary).not.toBeNull();
		expect(summary?.taskCount).toBe(1);
		expect(summary?.title).toBe("With Tasks");
	});
});
