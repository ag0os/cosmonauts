/**
 * Plan Manager for forge-plans
 * Orchestrates all core modules for plan CRUD operations
 */

import type { TaskManager } from "../tasks/task-manager.ts";
import {
	createPlanDirectory,
	deletePlanDirectory,
	ensurePlansDirectory,
	listPlanSlugs,
	readPlanFile,
	readSpecFile,
	writePlanFile,
	writeSpecFile,
} from "./file-system.ts";
import type {
	Plan,
	PlanCreateInput,
	PlanStatus,
	PlanSummary,
	PlanUpdateInput,
} from "./plan-types.ts";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): void {
	if (!slug) {
		throw new Error("Plan slug cannot be empty");
	}
	if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
		throw new Error(`Invalid plan slug (path traversal): ${slug}`);
	}
	if (!SLUG_PATTERN.test(slug)) {
		throw new Error(
			`Invalid plan slug "${slug}": must be lowercase alphanumeric with hyphens (e.g. "auth-system")`,
		);
	}
}

/**
 * PlanManager orchestrates all core modules for plan management
 */
export class PlanManager {
	private projectRoot: string;

	/**
	 * Create a new PlanManager instance
	 * @param projectRoot - The root directory of the project
	 */
	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
	}

	/**
	 * Create a new plan
	 * Creates the plan directory, writes plan.md, and optionally writes spec.md
	 * @param input - Plan creation input
	 * @returns The created plan
	 */
	async createPlan(input: PlanCreateInput): Promise<Plan> {
		validateSlug(input.slug);

		await ensurePlansDirectory(this.projectRoot);

		// Check if plan already exists
		const existing = await readPlanFile(this.projectRoot, input.slug);
		if (existing) {
			throw new Error(`Plan already exists: ${input.slug}`);
		}

		const now = new Date();

		const plan: Omit<Plan, "spec"> = {
			slug: input.slug,
			title: input.title,
			status: "active",
			createdAt: now,
			updatedAt: now,
			body: input.description ?? "",
		};

		// Create directory and write plan.md
		await createPlanDirectory(this.projectRoot, input.slug);
		await writePlanFile(this.projectRoot, input.slug, plan);

		// Write spec.md if provided
		if (input.spec) {
			await writeSpecFile(this.projectRoot, input.slug, input.spec);
		}

		return {
			...plan,
			spec: input.spec,
		};
	}

	/**
	 * Get a plan by slug
	 * @param slug - The plan slug (directory name)
	 * @returns The plan or null if not found
	 */
	async getPlan(slug: string): Promise<Plan | null> {
		const planData = await readPlanFile(this.projectRoot, slug);
		if (!planData) {
			return null;
		}

		const spec = await readSpecFile(this.projectRoot, slug);

		return {
			...planData,
			spec: spec ?? undefined,
		};
	}

	/**
	 * List all plans, optionally filtered by status
	 * @param statusFilter - Optional status to filter by
	 * @returns Array of plans
	 */
	async listPlans(statusFilter?: PlanStatus): Promise<Plan[]> {
		const slugs = await listPlanSlugs(this.projectRoot);
		const plans: Plan[] = [];

		for (const slug of slugs) {
			const plan = await this.getPlan(slug);
			if (plan) {
				if (!statusFilter || plan.status === statusFilter) {
					plans.push(plan);
				}
			}
		}

		return plans;
	}

	/**
	 * Update an existing plan's frontmatter fields
	 * @param slug - The plan slug to update
	 * @param input - Fields to update
	 * @returns The updated plan
	 * @throws Error if plan not found
	 */
	async updatePlan(slug: string, input: PlanUpdateInput): Promise<Plan> {
		const existing = await readPlanFile(this.projectRoot, slug);
		if (!existing) {
			throw new Error(`Plan not found: ${slug}`);
		}

		const updated: Omit<Plan, "spec"> = {
			...existing,
			title: input.title ?? existing.title,
			status: input.status ?? existing.status,
			updatedAt: new Date(),
		};

		await writePlanFile(this.projectRoot, slug, updated);

		const spec = await readSpecFile(this.projectRoot, slug);

		return {
			...updated,
			spec: spec ?? undefined,
		};
	}

	/**
	 * Delete a plan and its entire directory
	 * @param slug - The plan slug to delete
	 * @throws Error if plan not found
	 */
	async deletePlan(slug: string): Promise<void> {
		const existing = await readPlanFile(this.projectRoot, slug);
		if (!existing) {
			throw new Error(`Plan not found: ${slug}`);
		}

		await deletePlanDirectory(this.projectRoot, slug);
	}

	/**
	 * Get a plan summary with count of associated tasks
	 * The task count is obtained by querying TaskManager for tasks with the label "plan:<slug>"
	 * TaskManager is passed as a parameter to keep PlanManager and TaskManager loosely coupled
	 *
	 * @param slug - The plan slug
	 * @param taskManager - A TaskManager instance to query for associated tasks
	 * @returns The plan summary or null if plan not found
	 */
	async getPlanSummary(
		slug: string,
		taskManager: TaskManager,
	): Promise<PlanSummary | null> {
		const plan = await this.getPlan(slug);
		if (!plan) {
			return null;
		}

		const tasks = await taskManager.listTasks({ label: `plan:${slug}` });

		return {
			slug: plan.slug,
			title: plan.title,
			status: plan.status,
			createdAt: plan.createdAt,
			updatedAt: plan.updatedAt,
			taskCount: tasks.length,
		};
	}
}
