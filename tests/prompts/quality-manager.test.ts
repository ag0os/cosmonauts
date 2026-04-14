import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/quality-manager.md",
	import.meta.url,
);

describe("quality-manager prompt", () => {
	it("routes integration findings through the existing remediation flow", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

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

	it("falls back to fixer-only remediation on planless runs", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("This is a planless review run");
		expect(content).toContain(
			"do not create planless remediation tasks; use `fixer` as the fallback remediation path",
		);
		expect(content).toContain(
			"If `activePlanSlug` is unavailable, spawn `fixer` instead",
		);
		expect(content).toContain(
			"`complex` without `activePlanSlug` → spawn `fixer`",
		);
	});

	it("reruns integration verification after code-modifying remediation and accepts skipped reports", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

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
	});
});
