/**
 * Archive operations for forge-plans
 * Moves completed plans and their associated tasks from active directories
 * into forge/archive/, preserving original file structure.
 */

import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import type { TaskManager } from "../tasks/task-manager.ts";
import type { PlanManager } from "./plan-manager.ts";

// ============================================================================
// Constants
// ============================================================================

const ARCHIVE_PLANS_DIR = "forge/archive/plans";
const ARCHIVE_TASKS_DIR = "forge/archive/tasks";
const MEMORY_DIR = "memory";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of archiving a plan and its associated tasks
 */
export interface ArchiveResult {
	/** The slug of the archived plan */
	planSlug: string;
	/** Absolute path where the plan directory was moved */
	archivedPlanPath: string;
	/** Filenames of archived task files */
	archivedTaskFiles: string[];
	/** Whether the memory/ directory was ensured (created or already existed) */
	memoryDirEnsured: boolean;
}

// ============================================================================
// Core Function
// ============================================================================

/**
 * Archive a completed plan and its associated tasks.
 *
 * This function:
 * 1. Verifies the plan exists
 * 2. Checks all associated tasks are in Done status (safety check)
 * 3. Creates archive directories as needed
 * 4. Moves the plan directory to forge/archive/plans/<slug>/
 * 5. Moves all tasks with plan:<slug> label to forge/archive/tasks/
 * 6. Ensures memory/ directory exists at project root
 *
 * @param projectRoot - The root directory of the project
 * @param slug - The plan slug to archive
 * @param planManager - PlanManager instance to verify the plan
 * @param taskManager - TaskManager instance to find and verify associated tasks
 * @returns Archive result with paths and details
 * @throws Error if plan doesn't exist or tasks are not all Done
 */
export async function archivePlan(
	projectRoot: string,
	slug: string,
	planManager: PlanManager,
	taskManager: TaskManager,
): Promise<ArchiveResult> {
	// 1. Verify plan exists
	const plan = await planManager.getPlan(slug);
	if (!plan) {
		throw new Error(`Plan "${slug}" not found`);
	}

	// 2. Get associated tasks, check all are Done
	const tasks = await taskManager.listTasks({ label: `plan:${slug}` });
	const nonDoneTasks = tasks.filter((t) => t.status !== "Done");
	if (nonDoneTasks.length > 0) {
		const ids = nonDoneTasks.map((t) => `${t.id} (${t.status})`).join(", ");
		throw new Error(`Cannot archive plan "${slug}": tasks not Done: ${ids}`);
	}

	// 3. Ensure archive directories exist
	await mkdir(join(projectRoot, ARCHIVE_PLANS_DIR), { recursive: true });
	await mkdir(join(projectRoot, ARCHIVE_TASKS_DIR), { recursive: true });

	// 4. Move plan directory
	const srcPlanDir = join(projectRoot, "forge/plans", slug);
	const destPlanDir = join(projectRoot, ARCHIVE_PLANS_DIR, slug);
	await rename(srcPlanDir, destPlanDir);

	// 5. Move associated task files
	// Note: Archive is not atomic — if a task file move fails after the plan was
	// already moved, the system will be in a partially archived state. This is
	// acceptable for a filesystem-based system; recovery is manual.
	const archivedTaskFiles: string[] = [];
	const tasksDir = join(projectRoot, "forge/tasks");
	const taskFiles = tasks.length > 0 ? await readdir(tasksDir) : [];
	for (const task of tasks) {
		const taskFile = taskFiles.find((f) => f.startsWith(task.id));
		if (taskFile) {
			const srcPath = join(tasksDir, taskFile);
			const destPath = join(projectRoot, ARCHIVE_TASKS_DIR, taskFile);
			await rename(srcPath, destPath);
			archivedTaskFiles.push(taskFile);
		}
	}

	// 6. Ensure memory/ directory exists
	const memoryDir = join(projectRoot, MEMORY_DIR);
	await mkdir(memoryDir, { recursive: true });

	return {
		planSlug: slug,
		archivedPlanPath: destPlanDir,
		archivedTaskFiles,
		memoryDirEnsured: true,
	};
}
