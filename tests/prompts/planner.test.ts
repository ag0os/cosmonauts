import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/planner.md",
	import.meta.url,
);

describe("planner prompt", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-008
	it("records decision provenance and checks mechanism against intent", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Every entry carries `Decided by:` provenance");
		expect(content).toContain(
			"mutability (ratified vs derived) defaults derive from it",
		);
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain("**Intent outranks mechanism.**");
		expect(content).toContain("name which one wins");
	});

	it("identifies as a pragmatic architect", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("You're the Planner. A pragmatic architect");
	});

	it("treats test-first as the baseline and limits modes to adaptation and dialogic", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"You operate test-first by default — that's not a mode, it's the baseline.",
		);
		expect(content).toContain("**Adaptation**");
		expect(content).toContain("**Dialogic**");
	});

	it("delegates the readiness check and plan tooling to /skill:plan", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Load `/skill:plan` for plan lifecycle, readiness, plan tools, and plan-to-task handoff.",
		);
		// The detailed readiness checklist no longer lives in the persona.
		expect(content).not.toContain("**Plan Readiness Check**");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-012
	it("routes artifact formatting to work-artifacts while plan tooling stays in plan skill", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"load `/skill:work-artifacts` for artifact shape, behavior spine, and Quality Contract gate ladder rules",
		);
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/gate-contracts.md`");
		expect(content).toContain(
			"Load `/skill:plan` for plan lifecycle, readiness, plan tools, and plan-to-task handoff.",
		);
		expect(content).toContain(
			"Full planned feature/refactor plans require behavior IDs, source `AC-###`, seams, named tests, and `@cosmo-behavior plan:<slug>#B-###` markers.",
		);
		expect(content).toContain("Direct fixes stay lightweight");
		expect(content).toContain(
			"do not force direct fixes through `spec.md`, `plan.md`, or `architecture.md` ceremony",
		);
	});

	it("triggers execution only after approval and never as a chain stage", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain('`chain_run("task-manager -> coordinator")`');
		expect(content).toContain(
			"As a chain stage, don't trigger — the chain runner handles the next stage.",
		);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-010
	it("reads all review rounds and cites findings round-qualified", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Read every existing review artifact");
		expect(content).toContain("legacy `review.md` as round 1");
		expect(content).toContain(
			"Treat the highest-numbered round as the latest and use it as the revision driver.",
		);
		expect(content).toContain("cite addressed findings round-qualified");
		expect(content).toContain("`review-2.md PR-003`");
	});

	// @cosmo-behavior plan:planning-system-hardening#B-001
	it("requires a closing consistency pass over decisions and stage ordering", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("**Run the closing consistency pass.**");
		expect(content).toContain(
			"Walk every Decision Log entry against the design text and behaviors it governs.",
		);
		expect(content).toContain(
			"Walk the Implementation Order for intermediate states where a shipped artifact references a seam that no longer exists.",
		);
		expect(content).toContain(
			"Complete this pass before presenting the plan or handing it to plan-reviewer.",
		);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-002
	it("requires state-space enumeration with no implementer-decided cells", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"For designs that introduce states, bindings, or classifications, enumerate inputs × states",
		);
		expect(content).toContain("a defined outcome for every cell");
		expect(content).toContain("no implementer-decided cells");
	});

	// @cosmo-behavior plan:planning-system-hardening#B-003
	it("enforces the size checkpoint with slice boundaries or justification", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("**Apply the size checkpoint.**");
		expect(content).toContain("project's plan-size guidance");
		expect(content).toContain(
			"explicit slice boundaries in the Implementation Order or record an explicit justification",
		);
		expect(content).toContain(
			"Acknowledging the size concern in prose without resolving it is insufficient.",
		);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-004
	it("requires expected clauses provable by the named test", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Phrase each behavior's Expected clause as what its named test can actually assert.",
		);
		expect(content).toContain(
			"Behaviors proved by content tests must state text obligations, not runtime outcomes.",
		);
	});

	// @cosmo-behavior plan:planning-system-hardening#B-005
	it("requires naming trust boundary and consent gate for project-controlled execution", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"If the design executes anything project-controlled, name the trust boundary and the consent gate.",
		);
	});
});
