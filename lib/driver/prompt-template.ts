import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskManager } from "../tasks/task-manager.ts";
import { serializeTask } from "../tasks/task-serializer.ts";
import type { Task } from "../tasks/task-types.ts";
import type { PromptLayers } from "./types.ts";

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir?: string;
}

interface RenderPromptOptions {
	/** Extra text appended before the mandatory report contract (e.g. a driver retry note). */
	appendedNote?: string;
}

const DRIVE_REPORT_CONTRACT = [
	"## Drive Report Contract",
	"",
	"Drive parses your final response to decide whether this task is complete. Make the result machine-readable.",
	"",
	"Preferred report:",
	"",
	"```json",
	"{",
	'  "outcome": "success",',
	'  "files": [{ "path": "path/to/file.ts", "change": "modified" }],',
	'  "verification": [{ "command": "bun run test", "status": "pass" }],',
	'  "notes": "Optional concise context."',
	"}",
	"```",
	"",
	"Hard rules:",
	"- The very last non-empty line of your response MUST be exactly one of: `outcome: success`, `outcome: failure`, `outcome: partial`, or `outcome: completed`.",
	"- Use `outcome: success` only when every acceptance criterion is met and required verification passed, or you explicitly explain why verification was not run.",
	"- Use `outcome: failure` for unmet acceptance criteria, blockers, or required gates that failed and could not be fixed in this task.",
	"- Use `outcome: partial` only when the report clearly identifies completed work and remaining work.",
	"- Do not invent other values such as `outcome: blocked`; Drive will not recognize them.",
	"- Do not write anything after the final outcome line.",
].join("\n");

export async function renderPromptForTask(
	taskId: string,
	layers: PromptLayers,
	taskManager: TaskManager,
	options: RenderPromptOptions = {},
): Promise<string> {
	const promptLayers = layers as PromptLayersWithWorkdir;
	const sections = [await readFile(promptLayers.envelopePath, "utf-8")];

	if (promptLayers.preconditionPath) {
		sections.push(await readFile(promptLayers.preconditionPath, "utf-8"));
	}

	const task = await taskManager.getTask(taskId);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}
	sections.push(renderTaskSection(task));

	const overridePath = promptLayers.perTaskOverrideDir
		? join(promptLayers.perTaskOverrideDir, `${taskId}.md`)
		: undefined;
	const override = overridePath
		? await readFileIfExists(overridePath)
		: undefined;
	if (override) {
		sections.push(override);
	}

	if (options.appendedNote) {
		sections.push(options.appendedNote);
	}
	sections.push(DRIVE_REPORT_CONTRACT);

	const promptPath = join(
		resolvePromptWorkdir(promptLayers, taskManager),
		"prompts",
		`${taskId}.md`,
	);
	await mkdir(dirname(promptPath), { recursive: true });
	await writeFile(promptPath, joinPromptSections(sections), "utf-8");

	return promptPath;
}

function renderTaskSection(task: Task): string {
	return `# Task\n\n${serializeTask(task)}`;
}

function joinPromptSections(sections: string[]): string {
	return sections.map((section) => section.trimEnd()).join("\n\n");
}

async function readFileIfExists(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return undefined;
		}
		throw error;
	}
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function resolvePromptWorkdir(
	layers: PromptLayersWithWorkdir,
	taskManager: TaskManager,
): string {
	if (layers.workdir) {
		return layers.workdir;
	}

	if (layers.perTaskOverrideDir) {
		return dirname(layers.perTaskOverrideDir);
	}

	const projectRoot = (taskManager as unknown as { projectRoot?: unknown })
		.projectRoot;
	if (typeof projectRoot === "string" && projectRoot.length > 0) {
		return projectRoot;
	}

	throw new Error("Prompt workdir is required");
}
