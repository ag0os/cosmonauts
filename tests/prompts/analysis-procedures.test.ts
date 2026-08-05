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
const PLAN_REVIEWER_PROMPT_PATH = new URL(
	`${PROMPT_ROOT}plan-reviewer.md`,
	import.meta.url,
);
const WORKER_PROMPT_PATH = new URL(`${PROMPT_ROOT}worker.md`, import.meta.url);
const REFACTORER_PROMPT_PATH = new URL(
	`${PROMPT_ROOT}refactorer.md`,
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

	// @cosmo-behavior plan:analysis-investigation-procedures#B-021
	it("expresses plan review challenges in capability terms", async () => {
		const content = await readFile(PLAN_REVIEWER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"When challenging duplicate code paths, dependency direction against a declared architecture record, and proposed deletions, inspect the runtime capability bindings and use capability evidence alongside reading the code.",
		);
		expect(content).toContain(
			"Every finding that rests on capability evidence must cite that evidence.",
		);
		expect(content).toContain(
			"When relevant capability evidence is unavailable, mark the dimension `unchecked` in the Coverage Ledger, state the reason plainly, and never imply that the dimension was checked.",
		);
		expect(content).toContain(
			"As an investigation role, use only the two-way outcome: evidence, or no evidence — record it; neither outcome blocks the review.",
		);
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
	});

	// @cosmo-behavior plan:analysis-investigation-procedures#B-022
	it("requires worker trace before delete and audit at task close", async () => {
		const content = await readFile(WORKER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"At task start, record the current pre-commit `HEAD` commit SHA as the changed-scope audit base and preserve that literal SHA for task close.",
		);
		expect(content).toContain(
			"Before removing a file, export, type, dependency, or other structural element, trace its reachability and references; when the trace capability is available, deleting without that evidence is unacceptable.",
		);
		expect(content).toContain(
			"Before both committing and marking the task Done, run the changed-scope audit with the recorded task-start commit SHA as its explicit literal base.",
		);
		expect(content).toContain(
			"Never omit the base, substitute a branch name, symbolic ref, or shell variable, or let the requested scope widen to the whole project.",
		);
		expect(content).toContain(
			"For `completed`, correct each flagged finding with the narrowest change that clears that specific finding at its flagged location; never refactor already-passing code to improve a metric or enlarge the diff beyond what the finding requires.",
		);
		expect(content).toContain(
			"For `unbound`, record in the task's implementation notes that the evidence was unavailable and continue; never treat unavailable evidence as a clean result.",
		);
		expect(content).toContain(
			"For `unsupported`, degrade only the unsupported metric or scope; never widen the request or treat the missing evidence as zero.",
		);
		expect(content).toContain(
			"For `failed`, a failed binding or failed invocation blocks completion: preserve the failure evidence in the task's implementation notes, set the task Blocked, and do not mark it Done.",
		);
		expect(content).toContain(
			"Changes returned by a preview capability are proposals for review, not authorization to edit; apply only ordinary, narrow, reviewable edits yourself.",
		);
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
	});

	// @cosmo-behavior plan:analysis-investigation-procedures#B-023
	it("requires refactorer trace and changed scope evidence without metric chasing", async () => {
		const content = await readFile(REFACTORER_PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Before moving or removing a file, export, type, or dependency, trace its reachability and references; when the trace capability is available, reading call sites alone is not enough and the capability evidence is required.",
		);
		expect(content).toContain(
			"After any characterization-test commit and before the first structural change, record the current commit SHA as the structural-change base.",
		);
		expect(content).toContain(
			"Before committing and before marking the task Done, audit the changed scope from the recorded structural-change base commit SHA, supplying that exact literal SHA as the explicit base.",
		);
		expect(content).toContain(
			"Never omit the base, substitute a symbolic ref or branch name, or allow the requested scope to widen silently to the whole project.",
		);
		expect(content).toContain(
			"For `completed`, state the completed evidence and review every finding within the changed scope; make a narrow structural correction only when it preserves observable behavior.",
		);
		expect(content).toContain(
			"For `unbound`, record in the task's implementation notes that the evidence was unavailable and continue; never treat unavailable evidence as a clean result.",
		);
		expect(content).toContain(
			"For `unsupported`, degrade only the unsupported metric or scope; never widen the request or treat the missing evidence as zero.",
		);
		expect(content).toContain(
			"For `failed`, a failed binding or failed invocation blocks completion: preserve the failure evidence in the task's implementation notes, set the task Blocked, and do not mark it Done.",
		);
		expect(content).toContain(
			"No-behavior-change discipline outranks every metric: a better number is never a reason to change observable behavior.",
		);
		expect(content).toContain(
			"If a finding cannot be cleared without changing observable behavior, it is out of scope for the refactoring task: leave it unchanged and record it in the task's implementation notes.",
		);
		expect(content).toContain(
			"Changes returned by a preview capability are proposals for review, not authorization to edit.",
		);
		expect(content).not.toMatch(
			new RegExp(`\\b${["fal", "low"].join("")}\\b`, "iu"),
		);
	});
});
