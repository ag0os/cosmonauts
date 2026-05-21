import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/plan/SKILL.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

describe("plan skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-002
	it("routes artifact shape behavior spine and gate rules to work-artifacts", async () => {
		const content = await readSkill();

		expect(content).toContain(
			"For artifact shape, behavior spine, and gate rules",
		);
		expect(content).toContain("load `/skill:work-artifacts`");
		expect(content).toContain("Do not duplicate those canonical rules here.");
		expect(content).toContain("`references/spec-format.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/gate-contracts.md`");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-004
	it("requires behavior entries with source seam test marker and derived design", async () => {
		const content = await readSkill();

		expect(content).toContain("## Behavior-First Plans");
		expect(content).toContain("Full planned feature/refactor plans require");
		expect(content).toContain("Source `AC-###`");
		expect(content).toContain("Context");
		expect(content).toContain("Action");
		expect(content).toContain("Expected result");
		expect(content).toContain("Seam");
		expect(content).toContain("Named test");
		expect(content).toContain("@cosmo-behavior plan:<slug>#B-###");
		expect(content).toContain(
			"Treat `## Design` as derived from behavior placement.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-004
	it("rejects plans with behaviors missing named tests or markers", async () => {
		const content = await readSkill();

		expect(content).toContain("## Plan Readiness Check");
		expect(content).toContain("This is conversational output only");
		expect(content).toContain("**Behaviors**");
		expect(content).toContain("named test");
		expect(content).toContain("@cosmo-behavior plan:<slug>#B-###");
		expect(content).toContain(
			"Reject a full planned feature/refactor plan as not ready if any behavior lacks a named test or marker.",
		);
		expect(content).toContain("**Design derivation**");
		expect(content).toContain(
			"If it cannot trace to behavior seams, source criteria, and named tests",
		);
	});

	it("owns plan lifecycle tools readiness and task handoff", async () => {
		const content = await readSkill();

		expect(content).toContain("## Lifecycle");
		expect(content).toContain("## Plan Readiness Check");
		expect(content).toContain("## Tool Reference");
		expect(content).toContain("`plan_create`");
		expect(content).toContain("`plan_edit`");
		expect(content).toContain("`plan_archive`");
		expect(content).toContain("## Plan-To-Task Handoff");
		expect(content).toContain("task_create");
		expect(content).toContain("Load `/skill:task`");
	});

	it("describes only spec plan and architecture artifacts without stuffing architecture into plans", async () => {
		const content = await readSkill();

		expect(content).toContain("coordinates exactly these three work artifacts");
		expect(content).toContain("| `spec.md` |");
		expect(content).toContain("| `plan.md` |");
		expect(content).toContain("| `architecture.md` |");
		expect(content).toContain(
			"Do not move architecture-of-record content into `plan.md`.",
		);
		expect(content).toContain("keep only the relevant `Architecture Context`");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-020
	it("stays a dispatcher with directly linked optional references", async () => {
		const content = await readSkill();

		expect(content).toContain("dispatcher");
		expect(content).toContain("directly linked reference needed");
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain("`references/spec-format.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/architecture-format.md`");
		expect(content).toContain("`references/gate-contracts.md`");
		expect(content).not.toContain("references/lifecycle.md");
		expect(content).not.toContain("references/readiness.md");
	});
});
