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

	// @cosmo-behavior plan:spec-plan-intent#B-005
	it("checks intent presence and routes deviations to the protocol", async () => {
		const content = await readSkill();

		expect(content).toContain("**Intent**");
		expect(content).toContain("`## Intent`");
		expect(content).toContain("`INV-###` invariants");
		expect(content).toContain("the plan carries it when no spec exists");
		expect(content).toContain("rankings stated where invariants can conflict");
		expect(content).toContain("## Deviations And Amendments");
		expect(content).toContain(
			"amended on the record, never silently routed around",
		);
		expect(content).toContain(
			"`snap back / amend-on-record / halt-and-escalate / record`",
		);
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain("ratified ground moves only by human decision");
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
