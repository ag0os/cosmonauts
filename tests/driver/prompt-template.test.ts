import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderPromptForTask } from "../../lib/driver/prompt-template.ts";
import type { PromptLayers } from "../../lib/driver/types.ts";
import { TaskManager } from "../../lib/tasks/task-manager.ts";
import { useTempDir } from "../helpers/fs.ts";

interface TestPromptLayers extends PromptLayers {
	workdir: string;
}

const tmp = useTempDir("prompt-template-test-");

describe("prompt-template renderPromptForTask", () => {
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
