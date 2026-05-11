import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import definition from "../../bundled/coding/coding/agents/quality-manager.ts";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/quality-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("quality-manager prompt", () => {
	it("can spawn coordinator for task-driven remediation but not tdd-coordinator", () => {
		expect(definition.subagents).toContain("coordinator");
		expect(definition.subagents).not.toContain("tdd-coordinator");
	});

	it("routes integration findings through the existing remediation flow", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"missions/plans/<activePlanSlug>/integration-report.md",
		);
		expect(content).toContain(
			"Treat `integration_findings` exactly like reviewer findings",
		);
		expect(content).toContain(
			"If `overall: incorrect`, route the `I-###` findings in step 5",
		);
		expect(content).toContain("plan: activePlanSlug");
	});

	it("routes complex planned findings to a coordinator-driven review-fix task", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"Complex reviewer or integration findings on planned runs",
		);
		expect(content).toContain("create one remediation task via `task_create`");
		expect(content).toContain("labels `review-fix` and `review-round:<n>`");
		expect(content).toContain("pass `plan: activePlanSlug`");
		expect(content).toContain(
			'`chain_run(expression: "coordinator", prompt: "Process only tasks labeled review-round:<n>. Do not modify tasks without this label.", completionLabel: "review-round:<n>")`',
		);
	});

	it("falls back to fixer-only remediation on planless and verifier-native failures", async () => {
		const content = await readPrompt();

		expect(content).toContain("This is a planless review run");
		expect(content).toContain(
			"do not create remediation tasks, and route every otherwise-complex remediation item through `fixer` instead.",
		);
		expect(content).toContain(
			"Complex reviewer or integration findings on planless runs",
		);
		expect(content).toContain("**Verifier-native failures**:");
		expect(content).toContain("route to `fixer` for immediate remediation.");
		expect(content).toContain(
			"Do not create remediation tasks for verifier-native failures.",
		);
	});

	it("reruns integration verification after code-modifying remediation and accepts skipped reports", async () => {
		const content = await readPrompt();

		expect(content).toContain("spawn `integration-verifier`, then reread");
		expect(content).toContain(
			"This rerun trigger applies even when the remediation was not caused by integration findings.",
		);
		expect(content).toContain(
			"Confirm the latest integration report is `overall: correct` or `overall: skipped`.",
		);
		expect(content).toContain(
			"If `overall: skipped`, treat it as non-blocking",
		);
		expect(content).toContain(
			"any completed remediation tasks from `coordinator`",
		);
		expect(content).not.toContain("tdd-coordinator");
	});
});
