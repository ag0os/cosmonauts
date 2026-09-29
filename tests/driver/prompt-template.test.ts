import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	type DriveRunExpectations,
	renderPromptForTask,
} from "../../lib/driver/prompt-template.ts";
import type { PromptLayers } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

interface TestPromptLayers extends PromptLayers {
	workdir: string;
}

const tmp = useTempDir("prompt-template-test-");

describe("prompt-template renderPromptForTask", () => {
	test.each([
		"cosmonauts-subagent",
		"codex",
		"claude-cli",
	] as const)("renders a blocked human stop for %s", async (backendName) => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({ envelope: "Envelope" });
		const promptPath = await renderPromptForTask(
			taskId,
			{ envelopePath, workdir } as TestPromptLayers,
			taskManager,
			{
				runExpectations: {
					backendName,
					commitPolicy: "backend-commits",
					stateCommitPolicy: "none",
					preflightCommands: [],
					postflightCommands: [],
					projectRoot: tmp.path,
					workdir,
				},
			},
		);
		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain(
			"`outcome: blocked` is a human stop with no postflight or automatic retry",
		);
		expect(rendered).toContain("Do not commit before a blocked stop.");
	});

	test("renders the envelope and task into the run prompts directory", async () => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
			});

		const layers = { envelopePath, workdir } satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager);

		expect(promptPath).toBe(join(workdir, "prompts", `${taskId}.md`));
		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("Envelope instructions");
		expect(rendered).toContain("# Task");
		expect(rendered).toContain("Prompt Template Fixture");
	});

	test("renders the snapshotted envelope content instead of rereading the live file", async () => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({
				envelope: "Live envelope instructions",
			});
		const layers = {
			envelopePath,
			envelopeContent: "Snapshotted envelope instructions",
			workdir,
		} satisfies TestPromptLayers;
		await writeFile(envelopePath, "Mutated envelope instructions", "utf-8");

		const promptPath = await renderPromptForTask(taskId, layers, taskManager);

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("Snapshotted envelope instructions");
		expect(rendered).not.toContain("Live envelope instructions");
		expect(rendered).not.toContain("Mutated envelope instructions");
	});

	test("renders envelope plus precondition before the task body", async () => {
		const { taskManager, taskId, envelopePath, preconditionPath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
				precondition: "Precondition context",
			});

		const layers = {
			envelopePath,
			preconditionPath,
			workdir,
		} satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager);

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered.indexOf("Envelope instructions")).toBeLessThan(
			rendered.indexOf("Precondition context"),
		);
		expect(rendered.indexOf("Precondition context")).toBeLessThan(
			rendered.indexOf("# Task"),
		);
	});

	test("renders run expectations before the task body", async () => {
		const { taskManager, taskId, envelopePath, preconditionPath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
				precondition: "Precondition context",
			});

		const layers = {
			envelopePath,
			preconditionPath,
			workdir,
		} satisfies TestPromptLayers;
		const runExpectations = {
			backendName: "codex",
			commitPolicy: "driver-commits",
			stateCommitPolicy: "final-state-commit",
			preflightCommands: ["pnpm install --frozen-lockfile"],
			postflightCommands: ["pnpm test", "pnpm exec tsc --noEmit"],
			projectRoot: join(tmp.path, "project"),
			workdir,
			branch: "feature/run",
		} satisfies DriveRunExpectations;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			runExpectations,
		});

		const rendered = await readFile(promptPath, "utf-8");
		const expectationsIndex = rendered.indexOf("## Drive Run Expectations");
		expect(expectationsIndex).toBeGreaterThan(
			rendered.indexOf("Precondition context"),
		);
		expect(expectationsIndex).toBeLessThan(rendered.indexOf("# Task"));
		expect(rendered).toContain("Commit policy: driver-commits");
		expect(rendered).toContain("State commit policy: final-state-commit");
		expect(rendered).toContain("`pnpm test`");
		expect(rendered).toContain("`pnpm exec tsc --noEmit`");
		expect(rendered).toContain("Expected branch: feature/run");
	});

	test.each([
		"codex",
		"claude-cli",
	] as const)("instructs %s workers to check acceptance criteria via the cosmonauts CLI", async (backendName) => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
				acceptanceCriteria: ["First criterion", "Second criterion"],
			});
		const layers = { envelopePath, workdir } satisfies TestPromptLayers;

		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			runExpectations: {
				backendName,
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				preflightCommands: [],
				postflightCommands: [],
				projectRoot: join(tmp.path, "project"),
				workdir,
			},
		});

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("## Task Completion Protocol");
		expect(rendered).toContain(`cosmonauts task edit ${taskId} --check-ac`);
		expect(rendered.indexOf("## Task Completion Protocol")).toBeLessThan(
			rendered.indexOf("## Drive Report Contract"),
		);
		expect(rendered).toContain("is NOT a source commit");
	});

	// AC-007: the previous expectation pinned the missing in-process completion protocol.
	test("instructs internal subagent workers to check acceptance criteria via task_edit", async () => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
				acceptanceCriteria: ["First criterion"],
			});
		const layers = { envelopePath, workdir } satisfies TestPromptLayers;

		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			runExpectations: {
				backendName: "cosmonauts-subagent",
				commitPolicy: "driver-commits",
				stateCommitPolicy: "final-state-commit",
				preflightCommands: [],
				postflightCommands: [],
				projectRoot: join(tmp.path, "project"),
				workdir,
			},
		});

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("## Task Completion Protocol");
		expect(rendered).toContain(`taskId: "${taskId}"`);
		expect(rendered).toContain("task_edit");
		expect(rendered).toContain("checkAc: [index]");
		expect(rendered).not.toContain("--check-ac");
	});

	test.each([
		"cosmonauts-subagent",
		"codex",
		"claude-cli",
	] as const)("omits the completion protocol for %s when the task has no criteria", async (backendName) => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({ envelope: "Envelope instructions" });
		const layers = { envelopePath, workdir } satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			runExpectations: {
				backendName,
				commitPolicy: "driver-commits",
				stateCommitPolicy: "none",
				preflightCommands: [],
				postflightCommands: [],
				projectRoot: tmp.path,
				workdir,
			},
		});
		expect(await readFile(promptPath, "utf-8")).not.toContain(
			"## Task Completion Protocol",
		);
	});

	test("renders state commit policy expectations without changing the report contract", async () => {
		const { taskManager, taskId, envelopePath, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
			});
		const layers = { envelopePath, workdir } satisfies TestPromptLayers;

		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			runExpectations: {
				backendName: "codex",
				commitPolicy: "backend-commits",
				stateCommitPolicy: "none",
				preflightCommands: [],
				postflightCommands: [],
				projectRoot: join(tmp.path, "project"),
				workdir,
			},
		});

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("State commit policy: none");
		expect(rendered).toContain(
			"Drive will not create a final task-state commit for this run.",
		);
		expect(rendered).toContain("## Drive Report Contract");
		expect(rendered).toContain(
			"The very last non-empty line of your response MUST be exactly one of",
		);
	});

	test("appends a matching per-task override when it exists", async () => {
		const { taskManager, taskId, envelopePath, overrideDir, workdir } =
			await setupPromptTest({
				envelope: "Envelope instructions",
				override: "Task-specific override",
			});

		const layers = {
			envelopePath,
			perTaskOverrideDir: overrideDir,
			workdir,
		} satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager);

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered.indexOf("# Task")).toBeLessThan(
			rendered.indexOf("Task-specific override"),
		);
	});

	test("skips a missing per-task override file", async () => {
		const { taskManager, taskId, envelopePath, overrideDir, workdir } =
			await setupPromptTest({ envelope: "Envelope instructions" });

		const layers = {
			envelopePath,
			perTaskOverrideDir: overrideDir,
			workdir,
		} satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager);

		const rendered = await readFile(promptPath, "utf-8");
		expect(rendered).toContain("Envelope instructions");
		expect(rendered).not.toContain("Task-specific override");
	});

	test("always appends the Drive report contract as the final section", async () => {
		const { taskManager, taskId, envelopePath, overrideDir, workdir } =
			await setupPromptTest({
				envelope: "Custom envelope instructions",
				override: "Task-specific override",
			});

		const layers = {
			envelopePath,
			perTaskOverrideDir: overrideDir,
			workdir,
		} satisfies TestPromptLayers;
		const promptPath = await renderPromptForTask(taskId, layers, taskManager, {
			appendedNote: "Driver retry note",
		});

		const rendered = await readFile(promptPath, "utf-8");
		const reportContractIndex = rendered.indexOf("## Drive Report Contract");
		expect(reportContractIndex).toBeGreaterThan(
			rendered.indexOf("Task-specific override"),
		);
		expect(reportContractIndex).toBeGreaterThan(
			rendered.indexOf("Driver retry note"),
		);
		const exampleMarkerIndex = rendered.indexOf(
			"\n\noutcome: success\n\n",
			reportContractIndex,
		);
		const jsonClosingFenceIndex = rendered.indexOf(
			"\n```\n\noutcome: success",
			reportContractIndex,
		);
		const hardRulesIndex = rendered.indexOf(
			"\n\nHard rules:",
			reportContractIndex,
		);
		expect(jsonClosingFenceIndex).toBeGreaterThan(reportContractIndex);
		expect(exampleMarkerIndex).toBeGreaterThan(jsonClosingFenceIndex);
		expect(exampleMarkerIndex).toBeLessThan(hardRulesIndex);
		expect(rendered.trimEnd()).toMatch(
			/Do not write anything after the final outcome line\.$/,
		);
	});
});

interface PromptTestOptions {
	envelope: string;
	precondition?: string;
	override?: string;
	acceptanceCriteria?: string[];
}

async function setupPromptTest(options: PromptTestOptions): Promise<{
	taskManager: TaskManager;
	taskId: string;
	envelopePath: string;
	preconditionPath?: string;
	overrideDir: string;
	workdir: string;
}> {
	const projectRoot = join(tmp.path, "project");
	const workdir = join(tmp.path, "run");
	const templateDir = join(tmp.path, "templates");
	const overrideDir = join(workdir, "overrides");
	await mkdir(templateDir, { recursive: true });
	await mkdir(overrideDir, { recursive: true });

	const taskManager = new TaskManager(projectRoot);
	await taskManager.init();
	const task = await taskManager.createTask({
		title: "Prompt Template Fixture",
		description: "Render this task into the prompt.",
		acceptanceCriteria: options.acceptanceCriteria,
	});

	const envelopePath = join(templateDir, "envelope.md");
	await writeFile(envelopePath, options.envelope, "utf-8");

	const preconditionPath = options.precondition
		? join(templateDir, "precondition.md")
		: undefined;
	if (preconditionPath && options.precondition !== undefined) {
		await writeFile(preconditionPath, options.precondition, "utf-8");
	}

	if (options.override) {
		await writeFile(
			join(overrideDir, `${task.id}.md`),
			options.override,
			"utf-8",
		);
	}

	return {
		taskManager,
		taskId: task.id,
		envelopePath,
		preconditionPath,
		overrideDir,
		workdir,
	};
}
