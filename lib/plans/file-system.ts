/**
 * File system utilities for forge-plans
 * Handles all file I/O operations for plan directories and files
 */

import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { Plan, PlanStatus } from "./plan-types.ts";

// ============================================================================
// Constants
// ============================================================================

const FORGE_DIR = "forge";
const PLANS_DIR = "plans";
const PLAN_FILE = "plan.md";
const SPEC_FILE = "spec.md";

const VALID_STATUSES: PlanStatus[] = ["active", "completed"];

// ============================================================================
// Directory Operations
// ============================================================================

/**
 * Ensure the forge/plans/ directory exists
 * @param projectRoot - The project root directory
 * @returns The path to forge/plans/
 */
export async function ensurePlansDirectory(
	projectRoot: string,
): Promise<string> {
	const plansDir = join(projectRoot, FORGE_DIR, PLANS_DIR);
	await mkdir(plansDir, { recursive: true });
	return plansDir;
}

/**
 * List all plan directory slugs in forge/plans/
 * @param projectRoot - The project root directory
 * @returns Array of directory names (slugs)
 */
export async function listPlanSlugs(projectRoot: string): Promise<string[]> {
	const plansDir = join(projectRoot, FORGE_DIR, PLANS_DIR);

	try {
		const entries = await readdir(plansDir);
		const slugs: string[] = [];

		for (const entry of entries) {
			const entryPath = join(plansDir, entry);
			try {
				const stats = await stat(entryPath);
				if (stats.isDirectory()) {
					slugs.push(entry);
				}
			} catch {
				// Skip entries that can't be stat'd
			}
		}

		return slugs.sort();
	} catch (error) {
		// Return empty array if directory doesn't exist
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

/**
 * Create a plan directory at forge/plans/<slug>/
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 * @returns The path to the created directory
 */
export async function createPlanDirectory(
	projectRoot: string,
	slug: string,
): Promise<string> {
	const planDir = join(projectRoot, FORGE_DIR, PLANS_DIR, slug);
	await mkdir(planDir, { recursive: true });
	return planDir;
}

/**
 * Delete a plan directory and all its contents
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 */
export async function deletePlanDirectory(
	projectRoot: string,
	slug: string,
): Promise<void> {
	const planDir = join(projectRoot, FORGE_DIR, PLANS_DIR, slug);

	try {
		await rm(planDir, { recursive: true, force: true });
	} catch (error) {
		// Ignore if directory doesn't exist
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

// ============================================================================
// Plan File Operations
// ============================================================================

/**
 * Parse a plan status value, defaulting to "active" for invalid values
 */
function parseStatus(value: unknown): PlanStatus {
	if (!value) return "active";

	const str = String(value).toLowerCase().trim();
	if (VALID_STATUSES.includes(str as PlanStatus)) {
		return str as PlanStatus;
	}

	return "active";
}

/**
 * Parse a date value from frontmatter
 */
function parseDate(value: unknown, defaultDate: Date): Date {
	if (!value) return defaultDate;

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? defaultDate : value;
	}

	if (typeof value === "string") {
		const parsed = new Date(value.trim());
		if (!Number.isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return defaultDate;
}

/**
 * Read and parse a plan.md file
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 * @returns Parsed plan data (without spec) or null if file doesn't exist
 */
export async function readPlanFile(
	projectRoot: string,
	slug: string,
): Promise<Omit<Plan, "spec"> | null> {
	const filePath = join(projectRoot, FORGE_DIR, PLANS_DIR, slug, PLAN_FILE);

	try {
		const content = await readFile(filePath, "utf-8");
		const parsed = matter(content);
		const frontmatter = parsed.data;
		const now = new Date();

		return {
			slug,
			title: String(frontmatter.title || ""),
			status: parseStatus(frontmatter.status),
			createdAt: parseDate(frontmatter.createdAt, now),
			updatedAt: parseDate(frontmatter.updatedAt, now),
			body: parsed.content.trim(),
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

/**
 * Write a plan.md file with YAML frontmatter
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 * @param plan - The plan data to write
 */
export async function writePlanFile(
	projectRoot: string,
	slug: string,
	plan: Omit<Plan, "spec">,
): Promise<void> {
	const dirPath = join(projectRoot, FORGE_DIR, PLANS_DIR, slug);
	await mkdir(dirPath, { recursive: true });

	const filePath = join(dirPath, PLAN_FILE);

	const frontmatter: Record<string, unknown> = {
		title: plan.title,
		status: plan.status,
		createdAt: plan.createdAt.toISOString(),
		updatedAt: plan.updatedAt.toISOString(),
	};

	const serialized = matter.stringify(plan.body, frontmatter);

	// Ensure blank line between frontmatter and content
	const normalized = serialized.replace(
		/^(---\n[\s\S]*?\n---)\n(?!\n)/,
		"$1\n\n",
	);

	await writeFile(filePath, normalized, "utf-8");
}

// ============================================================================
// Spec File Operations
// ============================================================================

/**
 * Read a spec.md file
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 * @returns The spec file content or null if it doesn't exist
 */
export async function readSpecFile(
	projectRoot: string,
	slug: string,
): Promise<string | null> {
	const filePath = join(projectRoot, FORGE_DIR, PLANS_DIR, slug, SPEC_FILE);

	try {
		return await readFile(filePath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

/**
 * Write a spec.md file
 * @param projectRoot - The project root directory
 * @param slug - The plan slug (directory name)
 * @param content - The spec file content
 */
export async function writeSpecFile(
	projectRoot: string,
	slug: string,
	content: string,
): Promise<void> {
	const dirPath = join(projectRoot, FORGE_DIR, PLANS_DIR, slug);
	await mkdir(dirPath, { recursive: true });

	const filePath = join(dirPath, SPEC_FILE);
	await writeFile(filePath, content, "utf-8");
}
