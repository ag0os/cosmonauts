import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_ROOT = `../../bundled/${["cod", "ing"].join("")}/prompts/`;
const VERIFIER_PROMPT_PATH = new URL(
	`${PROMPT_ROOT}verifier.md`,
	import.meta.url,
);
const FIXER_PROMPT_PATH = new URL(`${PROMPT_ROOT}fixer.md`, import.meta.url);
const PLANNER_PROMPT_PATH = new URL(
	`${PROMPT_ROOT}planner.md`,
	import.meta.url,
);

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
		// The Expected clause requires the four outcomes to be reported
		// *distinctly*. Asserting the bare labels would pass on any prompt that
		// merely mentions them, so pin each outcome's operative semantics.
		expect(content).toContain(
			"Report the capability outcome separately from the claim's binary result:",
		);
		expect(content).toContain(
			"`completed` — the named tool returned a complete structured result. Evaluate the claim only from that result.",
		);
		expect(content).toContain(
			"`unbound` — runtime status says the capability has no binding. Report that the required evidence is unavailable; do not treat it as completed or clean.",
		);
		expect(content).toContain(
			"`unsupported` — the requested scope or metric is unsupported. Report exactly what is unsupported; do not widen the request or treat the missing evidence as clean.",
		);
		expect(content).toContain(
			"`failed` — status reports a failed binding or the named tool fails. Preserve the failure evidence and report that validation failed to run; never infer a result from partial output.",
		);
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

	// @cosmo-behavior plan:analysis-investigation-procedures#B-019
	it("expresses planner investigation in capability terms", async () => {
		const content = await readFile(PLANNER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Before writing a non-trivial design, inspect the runtime capability bindings, then use `analysis_complexity`, `analysis_duplication`, `analysis_boundaries`, and `analysis_trace` to gather evidence for every area the design will touch and every symbol it will move, reuse, or remove.",
		);
		expect(content).toContain(
			"Record the resulting capability evidence, or the explicit absence of evidence, in both the design and its risk register; missing evidence is uncertainty, never a clean baseline.",
		);
		expect(content).toContain(
			"As an investigation role, use only the two-way outcome: evidence, or no evidence — record it; neither outcome blocks the design.",
		);
		expect(content).not.toMatch(/\b(?:failed|unbound)\b/iu);
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
	});
});
