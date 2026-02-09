/**
 * Task Manager for forge-tasks
 * Orchestrates all core modules for task CRUD operations, search, and filtering
 */

import {
	deleteTaskFile,
	ensureForgeDirectory,
	getTaskFilename,
	listTaskFiles,
	loadConfig,
	parseTaskIdFromFilename,
	readTaskFile,
	saveConfig,
	saveTaskFile,
} from "./file-system.ts";
import { generateNextId, parseIdNumber } from "./id-generator.ts";
import { parseTask } from "./task-parser.ts";
import { serializeTask } from "./task-serializer.ts";
import type {
	AcceptanceCriterion,
	ForgeTasksConfig,
	Task,
	TaskCreateInput,
	TaskListFilter,
	TaskStatus,
	TaskUpdateInput,
} from "./task-types.ts";
import { DEFAULT_CONFIG } from "./task-types.ts";

/**
 * TaskManager orchestrates all core modules for task management
 */
export class TaskManager {
	private projectRoot: string;
	private config: ForgeTasksConfig | null = null;

	private assertValidDate(value: Date, fieldName: string): void {
		if (Number.isNaN(value.getTime())) {
			throw new Error(`Invalid ${fieldName}: expected a valid Date instance`);
		}
	}

	/**
	 * Create a new TaskManager instance
	 * @param projectRoot - The root directory of the project
	 */
	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Initialize the forge-tasks system
	 * Creates directories and config file if they don't exist
	 * @param config - Optional partial configuration to merge with defaults
	 * @returns The final configuration
	 */
	async init(config?: Partial<ForgeTasksConfig>): Promise<ForgeTasksConfig> {
		// Ensure directories exist
		await ensureForgeDirectory(this.projectRoot);

		// Load existing config or use defaults
		const existingConfig = await loadConfig(this.projectRoot);
		const baseConfig = existingConfig ?? { ...DEFAULT_CONFIG };

		// Merge provided config with base config
		const finalConfig: ForgeTasksConfig = {
			...baseConfig,
			...config,
		};

		// Save the config
		await saveConfig(this.projectRoot, finalConfig);

		// Cache the config
		this.config = finalConfig;

		return finalConfig;
	}

	/**
	 * Create a new task
	 * @param input - Task creation input
	 * @returns The created task
	 */
	async createTask(input: TaskCreateInput): Promise<Task> {
		const config = await this.ensureInitialized();

		if (input.dueDate) {
			this.assertValidDate(input.dueDate, "dueDate");
		}

		// Load existing tasks to determine next ID
		const existingTasks = await this.loadAllTasks();

		// Generate new ID
		const id = generateNextId(config, existingTasks);

		// Create timestamp
		const now = new Date();

		// Convert acceptance criteria strings to AcceptanceCriterion objects
		const acceptanceCriteria: AcceptanceCriterion[] = (
			input.acceptanceCriteria ?? []
		).map((text, index) => ({
			index: index + 1,
			text,
			checked: false,
		}));

		// Build the task object
		const task: Task = {
			id,
			title: input.title,
			status: "To Do" as TaskStatus,
			priority: input.priority ?? config.defaultPriority,
			assignee: input.assignee,
			createdAt: now,
			updatedAt: now,
			dueDate: input.dueDate,
			labels: [...(config.defaultLabels ?? []), ...(input.labels ?? [])],
			dependencies: input.dependencies ?? [],
			description: input.description,
			acceptanceCriteria,
		};

		// Serialize and save
		const content = serializeTask(task);
		const filename = getTaskFilename(task);
		await saveTaskFile(this.projectRoot, filename, content);

		// Update lastIdNumber in config to survive archiving
		const idNumber = parseIdNumber(id, config.prefix);
		if (idNumber !== null && (config.lastIdNumber ?? 0) < idNumber) {
			config.lastIdNumber = idNumber;
			this.config = config;
			await saveConfig(this.projectRoot, config);
		}

		return task;
	}

	/**
	 * Update an existing task
	 * @param id - Task ID to update
	 * @param input - Fields to update
	 * @returns The updated task
	 * @throws Error if task not found
	 */
	async updateTask(id: string, input: TaskUpdateInput): Promise<Task> {
		await this.ensureInitialized();

		if (input.dueDate) {
			this.assertValidDate(input.dueDate, "dueDate");
		}

		// Load existing task
		const existingTask = await this.getTask(id);
		if (!existingTask) {
			throw new Error(`Task not found: ${id}`);
		}

		// Find the old filename before updating
		const oldFilename = getTaskFilename(existingTask);

		// Merge updates into task
		const updatedTask: Task = {
			...existingTask,
			...input,
			updatedAt: new Date(),
			// Keep the original ID and createdAt
			id: existingTask.id,
			createdAt: existingTask.createdAt,
			// Ensure arrays are properly handled
			labels: input.labels ?? existingTask.labels,
			dependencies: input.dependencies ?? existingTask.dependencies,
			acceptanceCriteria:
				input.acceptanceCriteria ?? existingTask.acceptanceCriteria,
		};

		// Serialize and save
		const content = serializeTask(updatedTask);
		const newFilename = getTaskFilename(updatedTask);

		if (oldFilename !== newFilename) {
			// Write new file first to avoid data loss if write fails.
			await saveTaskFile(this.projectRoot, newFilename, content);
			await deleteTaskFile(this.projectRoot, oldFilename);
		} else {
			await saveTaskFile(this.projectRoot, newFilename, content);
		}

		return updatedTask;
	}

	/**
	 * Delete a task
	 * @param id - Task ID to delete
	 * @throws Error if task not found
	 */
	async deleteTask(id: string): Promise<void> {
		await this.ensureInitialized();

		// Find the task file
		const files = await listTaskFiles(this.projectRoot);
		const targetFile = files.find((file) => {
			const fileId = parseTaskIdFromFilename(file);
			return fileId?.toUpperCase() === id.toUpperCase();
		});

		if (!targetFile) {
			throw new Error(`Task not found: ${id}`);
		}

		await deleteTaskFile(this.projectRoot, targetFile);
	}

	/**
	 * Get a task by ID
	 * @param id - Task ID
	 * @returns The task or null if not found
	 */
	async getTask(id: string): Promise<Task | null> {
		await this.ensureInitialized();

		// Find the task file
		const files = await listTaskFiles(this.projectRoot);
		const targetFile = files.find((file) => {
			const fileId = parseTaskIdFromFilename(file);
			return fileId?.toUpperCase() === id.toUpperCase();
		});

		if (!targetFile) {
			return null;
		}

		const content = await readTaskFile(this.projectRoot, targetFile);
		if (!content) {
			return null;
		}

		return parseTask(content);
	}

	/**
	 * List all tasks, optionally filtered
	 * @param filter - Optional filter criteria
	 * @returns Array of tasks matching the filter
	 */
	async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		await this.ensureInitialized();

		const tasks = await this.loadAllTasks();

		if (!filter) {
			return tasks;
		}

		return tasks.filter((task) => this.matchesFilter(task, filter));
	}

	/**
	 * Search tasks by query string
	 * Searches title, description, implementationPlan, and implementationNotes
	 * @param query - Search query
	 * @param filter - Optional additional filter
	 * @returns Array of matching tasks
	 */
	async search(query: string, filter?: TaskListFilter): Promise<Task[]> {
		await this.ensureInitialized();

		const tasks = await this.loadAllTasks();
		const queryLower = query.toLowerCase();

		// Filter by search query
		const matchingTasks = tasks.filter((task) => {
			const searchableFields = [
				task.title,
				task.description,
				task.implementationPlan,
				task.implementationNotes,
			];

			return searchableFields.some((field) =>
				field?.toLowerCase().includes(queryLower),
			);
		});

		// Apply additional filter if provided
		if (!filter) {
			return matchingTasks;
		}

		return matchingTasks.filter((task) => this.matchesFilter(task, filter));
	}

	/**
	 * Ensure the system is initialized
	 * Loads config from disk if not already cached
	 * @returns The configuration
	 */
	private async ensureInitialized(): Promise<ForgeTasksConfig> {
		if (this.config) {
			return this.config;
		}

		// Try to load existing config
		const existingConfig = await loadConfig(this.projectRoot);
		if (existingConfig) {
			this.config = existingConfig;
			return this.config;
		}

		// Initialize with defaults if no config exists
		return await this.init();
	}

	/**
	 * Load all tasks from disk
	 * @returns Array of all tasks
	 */
	private async loadAllTasks(): Promise<Task[]> {
		const files = await listTaskFiles(this.projectRoot);
		const tasks: Task[] = [];

		for (const file of files) {
			const content = await readTaskFile(this.projectRoot, file);
			if (content) {
				try {
					const task = parseTask(content);
					tasks.push(task);
				} catch (error) {
					// Skip files that fail to parse
					if (process.env.DEBUG) {
						console.error(`Failed to parse task file ${file}:`, error);
					}
				}
			}
		}

		return tasks;
	}

	/**
	 * Check if a task matches the given filter
	 * @param task - Task to check
	 * @param filter - Filter criteria
	 * @returns True if task matches all filter criteria
	 */
	private matchesFilter(task: Task, filter: TaskListFilter): boolean {
		// Check status
		if (filter.status) {
			const statuses = Array.isArray(filter.status)
				? filter.status
				: [filter.status];
			if (!statuses.includes(task.status)) {
				return false;
			}
		}

		// Check priority
		if (filter.priority) {
			const priorities = Array.isArray(filter.priority)
				? filter.priority
				: [filter.priority];
			if (!task.priority || !priorities.includes(task.priority)) {
				return false;
			}
		}

		// Check assignee
		if (filter.assignee) {
			if (task.assignee?.toLowerCase() !== filter.assignee.toLowerCase()) {
				return false;
			}
		}

		// Check label
		if (filter.label) {
			const labelLower = filter.label.toLowerCase();
			if (!task.labels.some((l) => l.toLowerCase() === labelLower)) {
				return false;
			}
		}

		// Check hasNoDependencies
		if (filter.hasNoDependencies) {
			if (task.dependencies.length > 0) {
				return false;
			}
		}

		return true;
	}
}
