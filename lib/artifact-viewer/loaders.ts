import { access, readFile } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve } from "node:path";
import matter from "gray-matter";
import { ARCHITECTURE_MAP_OUTPUT_DIR } from "../architecture-map/types.ts";
import type { Plan } from "../plans/index.ts";
import { PlanManager, validateSlug } from "../plans/index.ts";
import { TaskManager } from "../tasks/task-manager.ts";
import type { Task, TaskListFilter, TaskStatus } from "../tasks/task-types.ts";
import { renderArtifactMarkdown } from "./renderer.ts";

export type ArtifactKind =
	| "plan"
	| "review"
	| "architecture-index"
	| "architecture-module";

export interface ArtifactDocument {
	readonly kind: ArtifactKind;
	readonly sourcePath: string;
	readonly title: string;
	readonly markdown: string;
	readonly html: string;
}

export interface PlanTaskStatus {
	readonly slug: string;
	readonly tasks: readonly Task[];
	readonly counts: Readonly<Record<TaskStatus, number>>;
}

export interface PlanViewerData {
	readonly plan: Plan;
	readonly planDocument: ArtifactDocument;
	readonly specDocument?: ArtifactDocument;
	readonly reviewDocument?: ArtifactDocument;
	readonly taskStatus: PlanTaskStatus;
	readonly taskConfigExists: boolean;
}

export async function loadPlanArtifact(options: {
	readonly projectRoot: string;
	readonly slug: string;
}): Promise<ArtifactDocument | null> {
	validateSlug(options.slug);

	const manager = new PlanManager(options.projectRoot);
	const plan = await manager.getPlan(options.slug);
	if (!plan) return null;

	const markdown = plan.spec
		? `${plan.body}\n\n## Spec\n\n${plan.spec}`.trim()
		: plan.body;
	return artifactDocument({
		kind: "plan",
		sourcePath: `missions/plans/${options.slug}/plan.md`,
		title: plan.title,
		markdown,
	});
}

export async function loadPlanPageData(options: {
	readonly projectRoot: string;
	readonly slug: string;
}): Promise<PlanViewerData | null> {
	validateSlug(options.slug);

	const manager = new PlanManager(options.projectRoot);
	const plan = await manager.getPlan(options.slug);
	if (!plan) return null;

	const reviewDocument = await loadPlanReviewArtifact(options);
	const taskStatus = await loadPlanTaskStatus(options);
	const taskConfigExists = await projectFileExists(
		options.projectRoot,
		"missions/tasks/config.json",
	);

	return {
		plan,
		planDocument: artifactDocument({
			kind: "plan",
			sourcePath: `missions/plans/${options.slug}/plan.md`,
			title: plan.title,
			markdown: plan.body,
		}),
		...(plan.spec
			? {
					specDocument: artifactDocument({
						kind: "plan",
						sourcePath: `missions/plans/${options.slug}/spec.md`,
						title: "Spec",
						markdown: plan.spec,
					}),
				}
			: {}),
		...(reviewDocument ? { reviewDocument } : {}),
		taskStatus,
		taskConfigExists,
	};
}

export async function loadPlanReviewArtifact(options: {
	readonly projectRoot: string;
	readonly slug: string;
}): Promise<ArtifactDocument | null> {
	validateSlug(options.slug);

	const sourcePath = `missions/plans/${options.slug}/review.md`;
	const markdown = await readProjectFile(options.projectRoot, sourcePath);
	if (markdown === null) return null;

	return artifactDocument({
		kind: "review",
		sourcePath,
		title: "Review",
		markdown,
	});
}

export async function loadReviewArtifact(options: {
	readonly projectRoot: string;
	readonly filename: string;
}): Promise<ArtifactDocument | null> {
	validateMarkdownFilename(options.filename, "review filename");

	const sourcePath = `missions/reviews/${options.filename}`;
	const markdown = await readProjectFile(options.projectRoot, sourcePath);
	if (markdown === null) return null;

	return artifactDocument({
		kind: "review",
		sourcePath,
		title: options.filename.replace(/\.md$/u, ""),
		markdown,
	});
}

export async function loadArchitectureIndexArtifact(options: {
	readonly projectRoot: string;
}): Promise<ArtifactDocument | null> {
	const sourcePath = `${ARCHITECTURE_MAP_OUTPUT_DIR}/index.md`;
	const markdown = await readProjectFile(options.projectRoot, sourcePath);
	if (markdown === null) return null;

	return artifactDocument({
		kind: "architecture-index",
		sourcePath,
		title: "Architecture Map",
		markdown,
	});
}

export async function loadArchitectureModuleArtifact(options: {
	readonly projectRoot: string;
	readonly resource: string;
}): Promise<ArtifactDocument | null> {
	validateArchitectureResource(options.resource);

	const shardPath = architectureModuleShardPath(options.resource);
	const sourcePath = `${ARCHITECTURE_MAP_OUTPUT_DIR}/${shardPath}`;
	const markdown = await readProjectFile(options.projectRoot, sourcePath);
	if (markdown === null) return null;

	return artifactDocument({
		kind: "architecture-module",
		sourcePath,
		title: options.resource,
		markdown,
	});
}

export async function loadPlanTaskStatus(options: {
	readonly projectRoot: string;
	readonly slug: string;
	readonly filter?: Omit<TaskListFilter, "label">;
}): Promise<PlanTaskStatus> {
	validateSlug(options.slug);

	const tasks = await new TaskManager(options.projectRoot).listTasksReadOnly({
		...options.filter,
		label: `plan:${options.slug}`,
	});
	return {
		slug: options.slug,
		tasks,
		counts: countTasksByStatus(tasks),
	};
}

export function validateArchitectureResource(resource: string): void {
	if (!resource) {
		throw new Error("Architecture resource cannot be empty");
	}
	if (resource === ".") return;
	if (
		resource.includes("\\") ||
		resource.startsWith("/") ||
		resource.split("/").includes("..") ||
		posix.normalize(resource) !== resource
	) {
		throw new Error(`Invalid architecture resource: ${resource}`);
	}

	const targetRoot = resolve("/", ARCHITECTURE_MAP_OUTPUT_DIR, "modules");
	const absolute = resolve(targetRoot, ...resource.split("/"));
	const rel = relative(targetRoot, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`Invalid architecture resource: ${resource}`);
	}
}

function architectureModuleShardPath(resource: string): string {
	const normalizedResource = resource === "." ? "root" : resource;
	return `modules/${normalizedResource}.md`;
}

function artifactDocument(input: {
	readonly kind: ArtifactKind;
	readonly sourcePath: string;
	readonly title: string;
	readonly markdown: string;
}): ArtifactDocument {
	const markdown = stripFrontmatter(input.markdown);
	return {
		...input,
		markdown,
		html: renderArtifactMarkdown(markdown),
	};
}

function stripFrontmatter(markdown: string): string {
	return matter(markdown).content.trim();
}

async function readProjectFile(
	projectRoot: string,
	projectPath: string,
): Promise<string | null> {
	const absolute = safeProjectFilePath(projectRoot, projectPath);

	try {
		return await readFile(absolute, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

function validateMarkdownFilename(filename: string, fieldName: string): void {
	if (
		!filename.endsWith(".md") ||
		filename.includes("/") ||
		filename.includes("\\") ||
		filename.includes("..")
	) {
		throw new Error(`Invalid ${fieldName}: ${filename}`);
	}
}

async function projectFileExists(
	projectRoot: string,
	projectPath: string,
): Promise<boolean> {
	const absolute = safeProjectFilePath(projectRoot, projectPath);

	return await access(absolute)
		.then(() => true)
		.catch(() => false);
}

function safeProjectFilePath(projectRoot: string, projectPath: string): string {
	const root = resolve(projectRoot);
	const absolute = resolve(root, ...projectPath.split("/"));
	const rel = relative(root, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`Unsafe artifact path: ${projectPath}`);
	}
	return absolute;
}

function countTasksByStatus(
	tasks: readonly Task[],
): Readonly<Record<TaskStatus, number>> {
	return {
		"To Do": tasks.filter((task) => task.status === "To Do").length,
		"In Progress": tasks.filter((task) => task.status === "In Progress").length,
		Done: tasks.filter((task) => task.status === "Done").length,
		Blocked: tasks.filter((task) => task.status === "Blocked").length,
	};
}
