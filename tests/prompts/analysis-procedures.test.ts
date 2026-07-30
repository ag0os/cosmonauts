import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_ROOT = `../../bundled/${["cod", "ing"].join("")}/prompts/`;
const VERIFIER_PROMPT_PATH = new URL(
	`${PROMPT_ROOT}verifier.md`,
	import.meta.url,
);
const FIXER_PROMPT_PATH = new URL(`${PROMPT_ROOT}fixer.md`, import.meta.url);

describe("analysis role procedures", () => {
	// @cosmo-behavior plan:analysis-gate-rewiring#B-017
	it("gives verifier a provider agnostic capability claim protocol", async () => {
		const content = await readFile(VERIFIER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"call `analysis_status` first, then call the named generic capability tool",
		);
		expect(content).toContain(
			"capability, literal base, scope, and metric exactly as supplied",
		);
		expect(content).toContain("`completed`");
		expect(content).toContain("`unbound`");
		expect(content).toContain("`unsupported`");
		expect(content).toContain("`failed`");
		expect(content).toContain(
			'`trace` and `fix-preview` carry `verdict: "not-applicable"`',
		);
		expect(content).toContain(
			"never infer a pass or fail from that operational verdict",
		);
		expect(content).toContain(
			"not the transport for the Quality Manager's gate findings",
		);
		expect(content).toContain("Do not derive or run a provider command.");
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
		expect(content).not.toContain(["analysis", "apply"].join("_"));
	});

	// @cosmo-behavior plan:analysis-gate-rewiring#B-018
	it("keeps fixer remediation replayed trace first preview only and agent edited", async () => {
		const content = await readFile(FIXER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"rerun the exact routed capability request before editing",
		);
		expect(content).toContain(
			"Treat your own fresh, complete structured result as ground truth.",
		);
		expect(content).toContain(
			"An `unbound` or `failed` rerun is `not-resolved`",
		);
		expect(content).toContain(
			"return it to the Quality Manager for re-analysis",
		);
		expect(content).toContain("Trace before deletion");
		expect(content).toContain("may call the generic fix-preview capability");
		expect(content).toContain(
			'`trace` and `fix-preview` return `verdict: "not-applicable"`',
		);
		expect(content).toContain(
			"Treat every proposed action as a proposal for review",
		);
		expect(content).toContain(
			"apply only ordinary, narrow, reviewable edits yourself",
		);
		expect(content).toContain(
			"make the NARROWEST change that clears the specific flagged finding at the flagged location",
		);
		expect(content).toContain(
			"Keep the existing `resolved` / `not-resolved` reporting contract",
		);
		expect(content).toContain(
			"Capability tools never mutate the codebase and expose no fix-application operation.",
		);
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
		expect(content).not.toContain(["analysis", "apply"].join("_"));
	});
});
