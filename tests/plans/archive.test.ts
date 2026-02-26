/**
 * Tests for plan archive operations
 * Covers the full archive flow: plan directory move, task file move,
 * directory creation, content preservation, and safety check rejection.
 */

import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archivePlan } from "../../lib/plans/archive.ts";
import { PlanManager } from "../../lib/plans/plan-manager.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";

describe("archivePlan", () => {
	let tempDir: string;
	let planManager: PlanManager;
	let taskManager: TaskManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "archive-test-"));
		planManager = new PlanManager(tempDir);
		taskManager = new TaskManager(tempDir);
		await taskManager.init({ prefix: "TEST" });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("moves plan directory to forge/archive/plans/<slug>/", async () => {
		await planManager.createPlan({
			slug: "test-plan",
			title: "Test Plan",
			description: "A test plan body.",
		});

		const result = await archivePlan(
			tempDir,
			"test-plan",
			planManager,
			taskManager,
		);

		expect(result.planSlug).toBe("test-plan");
		expect(result.archivedPlanPath).toBe(
			join(tempDir, "forge/archive/plans/test-plan"),
		);

		// Verify plan directory was moved
		const archiveStats = await stat(
			join(tempDir, "forge/archive/plans/test-plan"),
		);
		expect(archiveStats.isDirectory()).toBe(true);

		// Verify plan.md exists in archive
		const planContent = await readFile(
			join(tempDir, "forge/archive/plans/test-plan/plan.md"),
			"utf-8",
		);
		expect(planContent).toContain("Test Plan");

		// Verify original plan directory is gone
		await expect(
			stat(join(tempDir, "forge/plans/test-plan")),
		).rejects.toThrow();
	});

	it("moves associated task files to forge/archive/tasks/", async () => {
		await planManager.createPlan({
			slug: "task-plan",
			title: "Task Plan",
		});

		const task1 = await taskManager.createTask({
			title: "Task One",
			labels: ["plan:task-plan"],
		});
		const task2 = await taskManager.createTask({
			title: "Task Two",
			labels: ["plan:task-plan"],
		});

		// Mark tasks as Done
		await taskManager.updateTask(task1.id, { status: "Done" });
		await taskManager.updateTask(task2.id, { status: "Done" });

		const result = await archivePlan(
			tempDir,
			"task-plan",
			planManager,
			taskManager,
		);

		expect(result.archivedTaskFiles).toHaveLength(2);

		// Verify task files exist in archive
		const archiveTaskFiles = await readdir(
			join(tempDir, "forge/archive/tasks"),
		);
		expect(archiveTaskFiles).toHaveLength(2);

		// Verify task files are gone from original location
		const remainingTaskFiles = (
			await readdir(join(tempDir, "forge/tasks"))
		).filter((f) => f.endsWith(".md"));
		expect(remainingTaskFiles).toHaveLength(0);
	});

	it("preserves file content unchanged", async () => {
		const planBody = "# Detailed Plan\n\nWith lots of content.\n\n## Section";
		const specContent = "# Specification\n\nDetailed requirements.";

		await planManager.createPlan({
			slug: "preserve-test",
			title: "Preserve Test",
			description: planBody,
			spec: specContent,
		});

		const task = await taskManager.createTask({
			title: "Preserved Task",
			description: "Task with description.",
			labels: ["plan:preserve-test"],
		});
		await taskManager.updateTask(task.id, { status: "Done" });

		// Read original content before archiving
		const originalPlanContent = await readFile(
			join(tempDir, "forge/plans/preserve-test/plan.md"),
			"utf-8",
		);
		const originalSpecContent = await readFile(
			join(tempDir, "forge/plans/preserve-test/spec.md"),
			"utf-8",
		);

		// Find the task file
		const taskFiles = (await readdir(join(tempDir, "forge/tasks"))).filter(
			(f) => f.startsWith(task.id),
		);
		const originalTaskContent = await readFile(
			join(tempDir, "forge/tasks", taskFiles[0] as string),
			"utf-8",
		);

		await archivePlan(tempDir, "preserve-test", planManager, taskManager);

		// Verify plan.md content is identical
		const archivedPlanContent = await readFile(
			join(tempDir, "forge/archive/plans/preserve-test/plan.md"),
			"utf-8",
		);
		expect(archivedPlanContent).toBe(originalPlanContent);

		// Verify spec.md content is identical
		const archivedSpecContent = await readFile(
			join(tempDir, "forge/archive/plans/preserve-test/spec.md"),
			"utf-8",
		);
		expect(archivedSpecContent).toBe(originalSpecContent);

		// Verify task file content is identical
		const archivedTaskFiles = await readdir(
			join(tempDir, "forge/archive/tasks"),
		);
		const archivedTaskContent = await readFile(
			join(tempDir, "forge/archive/tasks", archivedTaskFiles[0] as string),
			"utf-8",
		);
		expect(archivedTaskContent).toBe(originalTaskContent);
	});

	it("creates archive directories when they do not exist", async () => {
		await planManager.createPlan({
			slug: "dir-creation",
			title: "Dir Creation",
		});

		// Verify archive directories don't exist yet
		await expect(stat(join(tempDir, "forge/archive"))).rejects.toThrow();

		await archivePlan(tempDir, "dir-creation", planManager, taskManager);

		// Verify archive directories were created
		const archivePlansStats = await stat(join(tempDir, "forge/archive/plans"));
		expect(archivePlansStats.isDirectory()).toBe(true);

		const archiveTasksStats = await stat(join(tempDir, "forge/archive/tasks"));
		expect(archiveTasksStats.isDirectory()).toBe(true);
	});

	it("creates memory/ directory at project root", async () => {
		await planManager.createPlan({
			slug: "memory-test",
			title: "Memory Test",
		});

		// Verify memory/ doesn't exist yet
		await expect(stat(join(tempDir, "memory"))).rejects.toThrow();

		const result = await archivePlan(
			tempDir,
			"memory-test",
			planManager,
			taskManager,
		);

		expect(result.memoryDirEnsured).toBe(true);

		const memoryStats = await stat(join(tempDir, "memory"));
		expect(memoryStats.isDirectory()).toBe(true);
	});

	it("succeeds when memory/ directory already exists", async () => {
		await planManager.createPlan({
			slug: "memory-exists",
			title: "Memory Exists",
		});

		// Pre-create memory/
		await mkdir(join(tempDir, "memory"), { recursive: true });
		await writeFile(join(tempDir, "memory/MEMORY.md"), "# Memory", "utf-8");

		const result = await archivePlan(
			tempDir,
			"memory-exists",
			planManager,
			taskManager,
		);

		expect(result.memoryDirEnsured).toBe(true);

		// Verify existing content was preserved
		const content = await readFile(join(tempDir, "memory/MEMORY.md"), "utf-8");
		expect(content).toBe("# Memory");
	});

	it("rejects when plan does not exist", async () => {
		await expect(
			archivePlan(tempDir, "nonexistent", planManager, taskManager),
		).rejects.toThrow('Plan "nonexistent" not found');
	});

	it("rejects when tasks are not all Done (In Progress)", async () => {
		await planManager.createPlan({
			slug: "incomplete-plan",
			title: "Incomplete Plan",
		});

		const task1 = await taskManager.createTask({
			title: "Done Task",
			labels: ["plan:incomplete-plan"],
		});
		const task2 = await taskManager.createTask({
			title: "In Progress Task",
			labels: ["plan:incomplete-plan"],
		});

		await taskManager.updateTask(task1.id, { status: "Done" });
		await taskManager.updateTask(task2.id, { status: "In Progress" });

		await expect(
			archivePlan(tempDir, "incomplete-plan", planManager, taskManager),
		).rejects.toThrow(/Cannot archive plan "incomplete-plan": tasks not Done/);
	});

	it("rejects when tasks are not all Done (To Do)", async () => {
		await planManager.createPlan({
			slug: "todo-plan",
			title: "Todo Plan",
		});

		await taskManager.createTask({
			title: "Todo Task",
			labels: ["plan:todo-plan"],
		});

		await expect(
			archivePlan(tempDir, "todo-plan", planManager, taskManager),
		).rejects.toThrow(/Cannot archive plan "todo-plan": tasks not Done/);
	});

	it("rejects when tasks are Blocked", async () => {
		await planManager.createPlan({
			slug: "blocked-plan",
			title: "Blocked Plan",
		});

		const task = await taskManager.createTask({
			title: "Blocked Task",
			labels: ["plan:blocked-plan"],
		});
		await taskManager.updateTask(task.id, { status: "Blocked" });

		await expect(
			archivePlan(tempDir, "blocked-plan", planManager, taskManager),
		).rejects.toThrow(/Cannot archive plan "blocked-plan": tasks not Done/);
	});

	it("archives plan with zero associated tasks", async () => {
		await planManager.createPlan({
			slug: "no-tasks",
			title: "No Tasks Plan",
			description: "Plan without any tasks.",
		});

		const result = await archivePlan(
			tempDir,
			"no-tasks",
			planManager,
			taskManager,
		);

		expect(result.archivedTaskFiles).toHaveLength(0);
		expect(result.planSlug).toBe("no-tasks");

		// Verify plan was still moved
		const archiveStats = await stat(
			join(tempDir, "forge/archive/plans/no-tasks"),
		);
		expect(archiveStats.isDirectory()).toBe(true);
	});

	it("only archives tasks with matching plan:<slug> label", async () => {
		await planManager.createPlan({
			slug: "plan-a",
			title: "Plan A",
		});
		await planManager.createPlan({
			slug: "plan-b",
			title: "Plan B",
		});

		const taskA = await taskManager.createTask({
			title: "Task for A",
			labels: ["plan:plan-a"],
		});
		const taskB = await taskManager.createTask({
			title: "Task for B",
			labels: ["plan:plan-b"],
		});
		const taskUnlabeled = await taskManager.createTask({
			title: "Unlabeled Task",
			labels: ["other"],
		});

		// Mark all tasks as Done
		await taskManager.updateTask(taskA.id, { status: "Done" });
		await taskManager.updateTask(taskB.id, { status: "Done" });
		await taskManager.updateTask(taskUnlabeled.id, { status: "Done" });

		const result = await archivePlan(
			tempDir,
			"plan-a",
			planManager,
			taskManager,
		);

		// Only task A should be archived
		expect(result.archivedTaskFiles).toHaveLength(1);
		expect(result.archivedTaskFiles[0]).toContain(taskA.id);

		// Task B and unlabeled task should still be in forge/tasks/
		const remainingTaskFiles = (
			await readdir(join(tempDir, "forge/tasks"))
		).filter((f) => f.endsWith(".md"));
		expect(remainingTaskFiles).toHaveLength(2);

		// Verify task B file is still there
		const taskBFile = remainingTaskFiles.find((f) => f.startsWith(taskB.id));
		expect(taskBFile).toBeDefined();

		// Verify unlabeled task file is still there
		const unlabeledFile = remainingTaskFiles.find((f) =>
			f.startsWith(taskUnlabeled.id),
		);
		expect(unlabeledFile).toBeDefined();
	});

	it("includes non-Done task IDs in error message", async () => {
		await planManager.createPlan({
			slug: "error-msg",
			title: "Error Msg",
		});

		const task1 = await taskManager.createTask({
			title: "Todo Task",
			labels: ["plan:error-msg"],
		});
		const task2 = await taskManager.createTask({
			title: "IP Task",
			labels: ["plan:error-msg"],
		});
		await taskManager.updateTask(task2.id, { status: "In Progress" });

		try {
			await archivePlan(tempDir, "error-msg", planManager, taskManager);
			expect.unreachable("Should have thrown");
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain(task1.id);
			expect(message).toContain("To Do");
			expect(message).toContain(task2.id);
			expect(message).toContain("In Progress");
		}
	});

	it("does not move plan directory if safety check fails", async () => {
		await planManager.createPlan({
			slug: "safe-plan",
			title: "Safe Plan",
			description: "Should not be moved.",
		});

		await taskManager.createTask({
			title: "Incomplete Task",
			labels: ["plan:safe-plan"],
		});

		await expect(
			archivePlan(tempDir, "safe-plan", planManager, taskManager),
		).rejects.toThrow();

		// Verify plan is still in original location
		const planStats = await stat(join(tempDir, "forge/plans/safe-plan"));
		expect(planStats.isDirectory()).toBe(true);

		// Verify archive directory was not created
		await expect(stat(join(tempDir, "forge/archive"))).rejects.toThrow();
	});

	it("rejects path traversal slugs in archive", async () => {
		await expect(
			archivePlan(tempDir, "../../etc", planManager, taskManager),
		).rejects.toThrow("path traversal");
	});

	it("rejects empty slug in archive", async () => {
		await expect(
			archivePlan(tempDir, "", planManager, taskManager),
		).rejects.toThrow("empty");
	});
});
