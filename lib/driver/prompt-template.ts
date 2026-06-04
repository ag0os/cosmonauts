import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskManager } from "../tasks/task-manager.ts";
import { serializeTask } from "../tasks/task-serializer.ts";
import type { Task } from "../tasks/task-types.ts";
import type {
	BackendName,
	DriverRunSpec,
	PromptLayers,
	StateCommitPolicy,
} from "./types.ts";

interface PromptLayersWithWorkdir extends PromptLayers {
	workdir?: string;
}

export interface DriveRunExpectations {
	backendName: BackendName;
	commitPolicy: DriverRunSpec["commitPolicy"];
	stateCommitPolicy: StateCommitPolicy;
	preflightCommands: readonly string[];
	postflightCommands: readonly string[];
	projectRoot: string;
	workdir: string;
	branch?: string;
}

interface RenderPromptOptions {
	/** Extra text appended before the mandatory report contract (e.g. a driver retry note). */
	appendedNote?: string;
	/** Run-level instructions generated from the concrete DriverRunSpec. */
	runExpectations?: DriveRunExpectations;
}

const DRIVE_REPORT_CONTRACT = [
	"## Drive Report Contract",
	"",
	"Drive parses your final response to decide whether the current work item is complete. Make the result machine-readable.",
	"",
	"Preferred report:",
	"",
	"```json",
	"{",
	'  "outcome": "success",',
	'  "files": [{ "path": "path/to/file.ts", "change": "modified" }],',
	'  "verification": [{ "command": "configured verification command", "status": "pass" }],',
	'  "notes": "Optional concise context."',
	"}",
	"```",
	"",
	"outcome: success",
	"",
	"The `outcome: success` line is the final line of the example response; it is outside the JSON and MUST match the JSON `outcome` field.",
	"",
	"Hard rules:",
	"- The very last non-empty line of your response MUST be exactly one of: `outcome: success`, `outcome: failure`, `outcome: partial`, or `outcome: completed`.",
	"- Use `outcome: success` only when every acceptance criterion or explicit requested outcome is met and required verification passed, or you explicitly explain why verification was not run.",
	"- Use `outcome: failure` for unmet acceptance criteria, blockers, or required gates that failed and could not be fixed in this work item.",
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

	if (options.runExpectations) {
		sections.push(renderRunExpectations(options.runExpectations));
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
	const backendName = options.runExpectations?.backendName;
	if (backendName) {
		const completionProtocol = renderTaskCompletionProtocol(
			taskId,
			task,
			backendName,
		);
		if (completionProtocol) {
			sections.push(completionProtocol);
		}
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

function renderTaskCompletionProtocol(
	taskId: string,
	task: Task,
	backendName: BackendName,
): string | undefined {
	// Internal subagent workers mark acceptance criteria through their native task
	// tool, so they need no CLI instruction. Only external CLI backends (codex,
	// claude-cli) must be told to check criteria via the cosmonauts CLI — without
	// this, their acceptance criteria stay unchecked and Drive blocks every task.
	if (backendName === "cosmonauts-subagent") {
		return undefined;
	}
	if (task.acceptanceCriteria.length === 0) {
		return undefined;
	}
	return [
		"## Task Completion Protocol",
		"",
		"When the work is done, mark each acceptance criterion you have verified as satisfied BEFORE writing your final report. The `cosmonauts` CLI is available on PATH in this workdir:",
		"",
		"```bash",
		`cosmonauts task edit ${taskId} --check-ac <index>   # repeat --check-ac per satisfied criterion, e.g. --check-ac 1 --check-ac 2`,
		"```",
		"",
		"- The acceptance criteria and their 1-based indexes are listed in the Task section above (the `#N` markers).",
		"- Only check a criterion after you have actually verified it (for example, the named test exists and passes). Leave any criterion you could not satisfy unchecked and report `outcome: failure` or `outcome: partial` with the reason.",
		"- Checking acceptance criteria updates task state through the CLI; it is NOT a source commit and does not violate the commit policy above.",
		"- Drive treats unchecked acceptance criteria as incomplete: if you report `outcome: success` while a criterion you were asked to satisfy is still unchecked, Drive will block the task.",
	].join("\n");
}

function renderRunExpectations(expectations: DriveRunExpectations): string {
	return [
		"## Drive Run Expectations",
		"",
		"These instructions are generated from this run's configuration. Treat them as authoritative over generic envelope defaults.",
		"",
		`- Backend: ${expectations.backendName}`,
		`- Project root: ${expectations.projectRoot}`,
		`- Run workdir: ${expectations.workdir}`,
		`- Expected branch: ${expectations.branch ?? "not specified"}`,
		`- Commit policy: ${expectations.commitPolicy}`,
		`  - ${commitPolicyInstruction(expectations.commitPolicy)}`,
		`- State commit policy: ${expectations.stateCommitPolicy}`,
		`  - ${stateCommitPolicyInstruction(expectations.stateCommitPolicy)}`,
		"- Required preflight commands:",
		renderCommandList(expectations.preflightCommands),
		"- Required postflight commands:",
		renderCommandList(expectations.postflightCommands),
		"- Use this repository's package manager, scripts, and conventions. Do not substitute another package manager when commands are provided here.",
		"- Report success only for the requested work item: acceptance criteria or explicitly requested outcomes must be satisfied, and required verification must pass or be explicitly explained if it was not run.",
		"- Optional extra checks are useful evidence. If an extra check fails for an environment limitation, report the command and output in notes; do not convert that alone into `outcome: failure` when required checks and requested outcomes are satisfied.",
	].join("\n");
}

function commitPolicyInstruction(
	policy: DriverRunSpec["commitPolicy"],
): string {
	if (policy === "driver-commits") {
		return "Do not run git add or git commit; leave committable changes for Drive to stage and commit after verification.";
	}
	if (policy === "backend-commits") {
		return "Create a git commit for your completed implementation changes before the final report.";
	}
	return "Do not create commits; leave completed changes in the worktree.";
}

function stateCommitPolicyInstruction(policy: StateCommitPolicy): string {
	if (policy === "final-state-commit") {
		return "After all queued tasks finish successfully, Drive is expected to create one final commit for its task-state updates.";
	}
	return "Drive will not create a final task-state commit for this run.";
}

function renderCommandList(commands: readonly string[]): string {
	if (commands.length === 0) {
		return "  - None configured.";
	}
	return commands.map((command) => `  - \`${command}\``).join("\n");
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
