import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/planner.md",
	import.meta.url,
);

describe("planner prompt", () => {
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
});
