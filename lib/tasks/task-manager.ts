/**
 * Task Manager for tasks
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
import { withTaskCreateLock } from "./lock.ts";
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

type TaskFilterPredicate = (task: Task, filter: TaskListFilter) => boolean;

const TASK_FILTER_PREDICATES: readonly TaskFilterPredicate[] = [
	matchesStatusFilter,
	matchesPriorityFilter,
	matchesAssigneeFilter,
	matchesLabelFilter,
	matchesDependencyFilter,
];

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
	 * Initialize the task system
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

		// Serialize ID allocation + file write + config bump behind a
		// process+filesystem lock so concurrent creates don't collide on IDs.
		return await withTaskCreateLock(this.projectRoot, () =>
			this.createTaskLocked(input, config),
		);
	}

	private async createTaskLocked(
		input: TaskCreateInput,
		config: ForgeTasksConfig,
	): Promise<Task> {
		// Re-read existing tasks inside the lock so allocation accounts for any
		// task a concurrent writer just created.
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

		const targetFile = await this.findTaskFilenameById(id);
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

		const targetFile = await this.findTaskFilenameById(id);
		if (!targetFile) {
			return null;
		}

		const content = await readTaskFile(this.projectRoot, targetFile);
		if (!content) {
			return null;
		}

		return parseTask(content);
	}

	private async findTaskFilenameById(id: string): Promise<string | undefined> {
		const normalizedId = id.toUpperCase();
		const files = await listTaskFiles(this.projectRoot);
		return files.find((file) => {
			const fileId = parseTaskIdFromFilename(file);
			return fileId?.toUpperCase() === normalizedId;
		});
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
		return TASK_FILTER_PREDICATES.every((predicate) => predicate(task, filter));
	}
}

function matchesStatusFilter(task: Task, filter: TaskListFilter): boolean {
	if (!filter.status) {
		return true;
	}

	const statuses = Array.isArray(filter.status)
		? filter.status
		: [filter.status];
	return statuses.includes(task.status);
}

function matchesPriorityFilter(task: Task, filter: TaskListFilter): boolean {
	if (!filter.priority) {
		return true;
	}

	const priorities = Array.isArray(filter.priority)
		? filter.priority
		: [filter.priority];
	return task.priority ? priorities.includes(task.priority) : false;
}

function matchesAssigneeFilter(task: Task, filter: TaskListFilter): boolean {
	if (!filter.assignee) {
		return true;
	}

	return task.assignee?.toLowerCase() === filter.assignee.toLowerCase();
}

function matchesLabelFilter(task: Task, filter: TaskListFilter): boolean {
	if (!filter.label) {
		return true;
	}

	const labelLower = filter.label.toLowerCase();
	return task.labels.some((label) => label.toLowerCase() === labelLower);
}

function matchesDependencyFilter(task: Task, filter: TaskListFilter): boolean {
	if (!filter.hasNoDependencies) {
		return true;
	}

	return task.dependencies.length === 0;
}
