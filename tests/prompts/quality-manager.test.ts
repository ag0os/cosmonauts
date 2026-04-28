import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/quality-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("quality-manager prompt", () => {
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

	it("defines the behavior-shaped predicate and applies it to finding prose", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"Only reviewer findings and `integration_findings` use behavior-shaped vs structural routing.",
		);
		expect(content).toContain(
			"> A finding is **behavior-shaped** iff it identifies (a) a code path that can be exercised by the project's test runner AND (b) at least one specific input or scenario that produces an observable wrong outcome a failing test could capture (a wrong return value, a missing error, an incorrect side effect on a known surface). Otherwise the finding is **structural**.",
		);
		expect(content).toContain(
			"Apply this predicate to finding prose: `summary`, `suggestedFix`, and any task acceptance criteria.",
		);
		expect(content).toContain(
			"Do not rely on structured `code_path`, `scenario`, or similar behavior fields; finding producers do not emit them yet.",
		);
	});

	it("routes behavior-shaped TDD findings through tdd-coordinator", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"If `activePlanHasBehaviors` is true and the finding is behavior-shaped, create the same four phase tasks used by `task-manager` (`-red`, `-red-verify`, `-green`, `-refactor`).",
		);
		expect(content).toContain(
			"Each task must include `review-fix` and `review-round:<n>` labels, pass `plan: activePlanSlug`, carry the appropriate `phase:*` label, and use captured `task_create` IDs for the dependency chain.",
		);
		expect(content).toContain(
			'`chain_run(expression: "tdd-coordinator", prompt: "Process only tasks labeled review-round:<n>. Do not modify tasks without this label.", completionLabel: "review-round:<n>")`',
		);
	});

	it("routes structural no-test-target findings through coordinator", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"create one `phase:green` task for the finding with a clear title and description, 1-7 outcome-focused acceptance criteria, labels `review-fix`, `review-round:<n>`, and `phase:green`,",
		);
		expect(content).toContain(
			"Use this path for structural findings, findings with no meaningful test target, and any planned run where the active plan does not expose a `## Behaviors` section.",
		);
		expect(content).toContain(
			'`chain_run(expression: "coordinator", prompt: "Process only structural green-only review tasks labeled review-round:<n>. Do not modify tasks without this label.", completionLabel: "review-round:<n>")`',
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
			"any completed remediation tasks from `coordinator` or `tdd-coordinator`",
		);
	});
});
