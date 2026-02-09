/**
 * Tests for TaskManager class
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskManager } from "../../lib/tasks/task-manager.js";
import type { ForgeTasksConfig } from "../../lib/tasks/task-types.js";

describe("TaskManager", () => {
	let tempDir: string;
	let manager: TaskManager;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "task-manager-test-"));
		manager = new TaskManager(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("init", () => {
		it("should create forge directories and config file", async () => {
			const config = await manager.init();

			expect(config.prefix).toBe("TASK");
			expect(config.zeroPadding).toBe(3);

			// Verify directories were created
			const forgeDir = join(tempDir, "forge");
			const tasksDir = join(tempDir, "forge", "tasks");
			expect(existsSync(forgeDir)).toBe(true);
			expect(existsSync(tasksDir)).toBe(true);
			expect(await access(join(tempDir, "forge", "tasks", "config.json")).then(() => true).catch(() => false)).toBe(true);
		});

		it("should merge provided config with defaults", async () => {
			const config = await manager.init({
				prefix: "FEAT",
				projectName: "Test Project",
			});

			expect(config.prefix).toBe("FEAT");
			expect(config.projectName).toBe("Test Project");
			expect(config.zeroPadding).toBe(3); // Default preserved
		});

		it("should preserve existing config when reinitializing", async () => {
			await manager.init({ prefix: "BUG" });
			const config = await manager.init({ projectName: "Updated Project" });

			expect(config.prefix).toBe("BUG"); // Original preserved
			expect(config.projectName).toBe("Updated Project");
		});
	});

	describe("createTask", () => {
		it("should create a task with required fields", async () => {
			await manager.init();

			const task = await manager.createTask({ title: "Test Task" });

			expect(task.id).toBe("TASK-001");
			expect(task.title).toBe("Test Task");
			expect(task.status).toBe("To Do");
			expect(task.labels).toEqual([]);
			expect(task.dependencies).toEqual([]);
			expect(task.acceptanceCriteria).toEqual([]);
		});

		it("should create a task with all optional fields", async () => {
			await manager.init();

			const dueDate = new Date("2026-02-01");
			const task = await manager.createTask({
				title: "Full Task",
				description: "A complete task",
				priority: "high",
				assignee: "john",
				dueDate,
				labels: ["backend", "api"],
				dependencies: ["TASK-001"],
				acceptanceCriteria: ["Write tests", "Implement feature"],
			});

			expect(task.title).toBe("Full Task");
			expect(task.description).toBe("A complete task");
			expect(task.priority).toBe("high");
			expect(task.assignee).toBe("john");
			expect(task.dueDate).toEqual(dueDate);
			expect(task.labels).toEqual(["backend", "api"]);
			expect(task.dependencies).toEqual(["TASK-001"]);
			expect(task.acceptanceCriteria).toEqual([
				{ index: 1, text: "Write tests", checked: false },
				{ index: 2, text: "Implement feature", checked: false },
			]);
		});

		it("should auto-increment task IDs", async () => {
			await manager.init();

			const task1 = await manager.createTask({ title: "Task 1" });
			const task2 = await manager.createTask({ title: "Task 2" });
			const task3 = await manager.createTask({ title: "Task 3" });

			expect(task1.id).toBe("TASK-001");
			expect(task2.id).toBe("TASK-002");
			expect(task3.id).toBe("TASK-003");
		});

		it("should use custom prefix from config", async () => {
			await manager.init({ prefix: "FEAT" });

			const task = await manager.createTask({ title: "Feature" });

			expect(task.id).toBe("FEAT-001");
		});

		it("should apply default labels from config", async () => {
			await manager.init({ defaultLabels: ["team-a"] });

			const task = await manager.createTask({
				title: "Task with default labels",
				labels: ["backend"],
			});

			expect(task.labels).toEqual(["team-a", "backend"]);
		});

		it("should apply default priority from config", async () => {
			await manager.init({ defaultPriority: "medium" });

			const task = await manager.createTask({
				title: "Task with default priority",
			});

			expect(task.priority).toBe("medium");
		});

		it("should save task file in forge/tasks/ directory", async () => {
			await manager.init();

			await manager.createTask({ title: "Test Task" });

			// Verify task file exists in forge/tasks/
			const tasksDir = join(tempDir, "forge", "tasks");
			const taskFileExists = await access(join(tasksDir, "TASK-001 - Test Task.md")).then(() => true).catch(() => false);
			expect(taskFileExists).toBe(true);
		});
	});

	describe("getTask", () => {
		it("should retrieve a task by ID", async () => {
			await manager.init();
			await manager.createTask({
				title: "My Task",
				description: "Description",
			});

			const task = await manager.getTask("TASK-001");

			expect(task).not.toBeNull();
			expect(task?.id).toBe("TASK-001");
			expect(task?.title).toBe("My Task");
			expect(task?.description).toBe("Description");
		});

		it("should return null for non-existent task", async () => {
			await manager.init();

			const task = await manager.getTask("TASK-999");

			expect(task).toBeNull();
		});

		it("should be case-insensitive for ID lookup", async () => {
			await manager.init();
			await manager.createTask({ title: "Task" });

			const task1 = await manager.getTask("task-001");
			const task2 = await manager.getTask("TASK-001");
			const task3 = await manager.getTask("Task-001");

			expect(task1).not.toBeNull();
			expect(task2).not.toBeNull();
			expect(task3).not.toBeNull();
		});
	});

	describe("updateTask", () => {
		it("should update task fields", async () => {
			await manager.init();
			await manager.createTask({ title: "Original Title" });

			const updated = await manager.updateTask("TASK-001", {
				title: "Updated Title",
				status: "In Progress",
				priority: "high",
			});

			expect(updated.title).toBe("Updated Title");
			expect(updated.status).toBe("In Progress");
			expect(updated.priority).toBe("high");
		});

		it("should update the updatedAt timestamp", async () => {
			await manager.init();
			const created = await manager.createTask({ title: "Task" });
			const originalUpdatedAt = created.updatedAt;

			// Small delay to ensure timestamp difference
			await new Promise((resolve) => setTimeout(resolve, 10));

			const updated = await manager.updateTask("TASK-001", {
				title: "Updated",
			});

			expect(updated.updatedAt.getTime()).toBeGreaterThan(
				originalUpdatedAt.getTime(),
			);
		});

		it("should throw error for non-existent task", async () => {
			await manager.init();

			await expect(
				manager.updateTask("TASK-999", { title: "New Title" }),
			).rejects.toThrow("Task not found: TASK-999");
		});

		it("should handle filename changes when title changes", async () => {
			await manager.init();
			await manager.createTask({ title: "Original Title" });

			await manager.updateTask("TASK-001", { title: "New Title" });

			// Should be able to retrieve with new title
			const task = await manager.getTask("TASK-001");
			expect(task).not.toBeNull();
			expect(task?.title).toBe("New Title");

			// Verify old file is removed by listing tasks
			const tasks = await manager.listTasks();
			expect(tasks.length).toBe(1);
		});

		it("should update acceptance criteria", async () => {
			await manager.init();
			await manager.createTask({
				title: "Task",
				acceptanceCriteria: ["Item 1", "Item 2"],
			});

			const updated = await manager.updateTask("TASK-001", {
				acceptanceCriteria: [
					{ index: 1, text: "Updated Item 1", checked: true },
					{ index: 2, text: "Item 2", checked: false },
					{ index: 3, text: "New Item 3", checked: false },
				],
			});

			expect(updated.acceptanceCriteria.length).toBe(3);
			expect(updated.acceptanceCriteria[0]?.checked).toBe(true);
			expect(updated.acceptanceCriteria[2]?.text).toBe("New Item 3");
		});
	});

	describe("deleteTask", () => {
		it("should delete a task", async () => {
			await manager.init();
			await manager.createTask({ title: "Task to Delete" });

			await manager.deleteTask("TASK-001");

			const task = await manager.getTask("TASK-001");
			expect(task).toBeNull();
		});

		it("should throw error for non-existent task", async () => {
			await manager.init();

			await expect(manager.deleteTask("TASK-999")).rejects.toThrow(
				"Task not found: TASK-999",
			);
		});

		it("should be case-insensitive for ID", async () => {
			await manager.init();
			await manager.createTask({ title: "Task" });

			await manager.deleteTask("task-001");

			const task = await manager.getTask("TASK-001");
			expect(task).toBeNull();
		});
	});

	describe("listTasks", () => {
		it("should list all tasks", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.createTask({ title: "Task 2" });
			await manager.createTask({ title: "Task 3" });

			const tasks = await manager.listTasks();

			expect(tasks.length).toBe(3);
		});

		it("should filter by status", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.updateTask("TASK-001", { status: "In Progress" });
			await manager.createTask({ title: "Task 2" });

			const inProgressTasks = await manager.listTasks({
				status: "In Progress",
			});

			expect(inProgressTasks.length).toBe(1);
			expect(inProgressTasks[0]?.id).toBe("TASK-001");
		});

		it("should filter by multiple statuses", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.updateTask("TASK-001", { status: "In Progress" });
			await manager.createTask({ title: "Task 2" });
			await manager.updateTask("TASK-002", { status: "Done" });
			await manager.createTask({ title: "Task 3" });

			const tasks = await manager.listTasks({
				status: ["In Progress", "Done"],
			});

			expect(tasks.length).toBe(2);
		});

		it("should filter by priority", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1", priority: "high" });
			await manager.createTask({ title: "Task 2", priority: "low" });
			await manager.createTask({ title: "Task 3", priority: "high" });

			const highPriorityTasks = await manager.listTasks({ priority: "high" });

			expect(highPriorityTasks.length).toBe(2);
		});

		it("should filter by assignee", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1", assignee: "alice" });
			await manager.createTask({ title: "Task 2", assignee: "bob" });
			await manager.createTask({ title: "Task 3", assignee: "Alice" }); // Case variation

			const aliceTasks = await manager.listTasks({ assignee: "alice" });

			expect(aliceTasks.length).toBe(2); // Case-insensitive match
		});

		it("should filter by label", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1", labels: ["backend", "api"] });
			await manager.createTask({ title: "Task 2", labels: ["frontend"] });
			await manager.createTask({ title: "Task 3", labels: ["Backend"] }); // Case variation

			const backendTasks = await manager.listTasks({ label: "backend" });

			expect(backendTasks.length).toBe(2); // Case-insensitive match
		});

		it("should filter by hasNoDependencies", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.createTask({ title: "Task 2", dependencies: ["TASK-001"] });
			await manager.createTask({ title: "Task 3" });

			const independentTasks = await manager.listTasks({
				hasNoDependencies: true,
			});

			expect(independentTasks.length).toBe(2);
		});

		it("should combine multiple filters", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1", priority: "high" });
			await manager.updateTask("TASK-001", { status: "In Progress" });
			await manager.createTask({ title: "Task 2", priority: "high" });
			await manager.createTask({ title: "Task 3", priority: "low" });
			await manager.updateTask("TASK-003", { status: "In Progress" });

			const tasks = await manager.listTasks({
				status: "In Progress",
				priority: "high",
			});

			expect(tasks.length).toBe(1);
			expect(tasks[0]?.id).toBe("TASK-001");
		});
	});

	describe("search", () => {
		it("should search by title", async () => {
			await manager.init();
			await manager.createTask({ title: "Implement authentication" });
			await manager.createTask({ title: "Fix database bug" });
			await manager.createTask({ title: "Auth improvements" });

			const results = await manager.search("auth");

			expect(results.length).toBe(2);
		});

		it("should search by description", async () => {
			await manager.init();
			await manager.createTask({
				title: "Task 1",
				description: "This task involves authentication",
			});
			await manager.createTask({
				title: "Task 2",
				description: "Database work",
			});

			const results = await manager.search("authentication");

			expect(results.length).toBe(1);
		});

		it("should search by implementation plan", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.updateTask("TASK-001", {
				implementationPlan: "Step 1: Setup Redis cache",
			});
			await manager.createTask({ title: "Task 2" });

			const results = await manager.search("redis");

			expect(results.length).toBe(1);
		});

		it("should search by implementation notes", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.updateTask("TASK-001", {
				implementationNotes: "Had issues with PostgreSQL connection",
			});
			await manager.createTask({ title: "Task 2" });

			const results = await manager.search("postgresql");

			expect(results.length).toBe(1);
		});

		it("should be case-insensitive", async () => {
			await manager.init();
			await manager.createTask({ title: "UPPERCASE Title" });
			await manager.createTask({ title: "lowercase title" });

			const results = await manager.search("TITLE");

			expect(results.length).toBe(2);
		});

		it("should apply additional filters to search results", async () => {
			await manager.init();
			await manager.createTask({ title: "Auth feature", priority: "high" });
			await manager.createTask({ title: "Auth bug", priority: "low" });

			const results = await manager.search("auth", { priority: "high" });

			expect(results.length).toBe(1);
			expect(results[0]?.priority).toBe("high");
		});

		it("should return empty array for no matches", async () => {
			await manager.init();
			await manager.createTask({ title: "Task 1" });
			await manager.createTask({ title: "Task 2" });

			const results = await manager.search("nonexistent");

			expect(results.length).toBe(0);
		});
	});

	describe("lazy initialization", () => {
		it("should auto-initialize on first operation", async () => {
			// Don't call init() explicitly
			const task = await manager.createTask({ title: "Auto-initialized" });

			expect(task.id).toBe("TASK-001");

			// Verify config was created
			expect(await access(join(tempDir, "forge", "tasks", "config.json")).then(() => true).catch(() => false)).toBe(true);
		});

		it("should load existing config on first operation", async () => {
			// Create config manually at the new location
			const config: ForgeTasksConfig = {
				prefix: "BUG",
				zeroPadding: 4,
			};
			// Ensure directories exist first
			const { mkdir } = await import("node:fs/promises");
			await mkdir(join(tempDir, "forge", "tasks"), { recursive: true });
			await writeFile(
				join(tempDir, "forge", "tasks", "config.json"),
				JSON.stringify(config),
				"utf-8",
			);

			// Create task without init()
			const task = await manager.createTask({ title: "Task" });

			expect(task.id).toBe("BUG-0001");
		});
	});

	describe("full lifecycle", () => {
		it("should support complete Create -> Update -> Get -> Delete workflow", async () => {
			await manager.init({ prefix: "LIFE" });

			// Step 1: Create a task
			const created = await manager.createTask({
				title: "Lifecycle Test Task",
				priority: "medium",
				labels: ["test"],
			});

			expect(created.id).toBe("LIFE-001");
			expect(created.status).toBe("To Do");
			expect(created.title).toBe("Lifecycle Test Task");
			expect(created.priority).toBe("medium");
			expect(created.labels).toEqual(["test"]);

			// Step 2: Update the task with description and implementation plan
			const updated = await manager.updateTask("LIFE-001", {
				status: "In Progress",
				assignee: "developer",
				description: "Testing the full lifecycle",
				implementationPlan: "Step 1: Do X\nStep 2: Do Y",
			});

			expect(updated.id).toBe("LIFE-001");
			expect(updated.status).toBe("In Progress");
			expect(updated.assignee).toBe("developer");
			expect(updated.description).toBe("Testing the full lifecycle");
			expect(updated.implementationPlan).toBe("Step 1: Do X\nStep 2: Do Y");
			// Original fields should be preserved
			expect(updated.title).toBe("Lifecycle Test Task");
			expect(updated.labels).toEqual(["test"]);

			// Step 3: Retrieve the task and verify persistence
			const retrieved = await manager.getTask("LIFE-001");
			expect(retrieved).not.toBeNull();
			expect(retrieved?.id).toBe("LIFE-001");
			expect(retrieved?.status).toBe("In Progress");
			expect(retrieved?.assignee).toBe("developer");
			expect(retrieved?.description).toBe("Testing the full lifecycle");
			expect(retrieved?.implementationPlan).toBe("Step 1: Do X\nStep 2: Do Y");

			// Step 4: Complete the task
			const completed = await manager.updateTask("LIFE-001", {
				status: "Done",
				implementationNotes: "Completed successfully",
			});

			expect(completed.status).toBe("Done");
			expect(completed.implementationNotes).toBe("Completed successfully");

			// Step 5: Delete the task
			await manager.deleteTask("LIFE-001");

			// Verify deletion
			const deleted = await manager.getTask("LIFE-001");
			expect(deleted).toBeNull();

			// Verify list is empty
			const tasks = await manager.listTasks();
			expect(tasks.length).toBe(0);
		});

		it("should persist tasks across TaskManager instances", async () => {
			// Create with first manager
			await manager.init({ prefix: "PERSIST" });
			await manager.createTask({
				title: "Persistent Task",
				priority: "high",
			});

			// Create a new manager instance for the same directory
			const newManager = new TaskManager(tempDir);

			// Should be able to retrieve the task without init()
			const task = await newManager.getTask("PERSIST-001");
			expect(task).not.toBeNull();
			expect(task?.title).toBe("Persistent Task");
			expect(task?.priority).toBe("high");

			// Should be able to update
			await newManager.updateTask("PERSIST-001", { status: "In Progress" });

			// Original manager should see the update
			const updatedTask = await manager.getTask("PERSIST-001");
			expect(updatedTask?.status).toBe("In Progress");
		});
	});
});
