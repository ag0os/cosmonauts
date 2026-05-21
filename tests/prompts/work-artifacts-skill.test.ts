import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/work-artifacts/SKILL.md",
	import.meta.url,
);
const REFERENCE_ROOT = new URL(
	"../../domains/shared/skills/work-artifacts/references/",
	import.meta.url,
);

const REQUIRED_REFERENCES = [
	"workflow-tiers.md",
	"spec-format.md",
	"plan-format.md",
	"architecture-format.md",
	"behavior-spine.md",
	"gate-contracts.md",
	"visual-primitives.md",
	"examples.md",
] as const;

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

async function readReference(name: (typeof REQUIRED_REFERENCES)[number]) {
	return readFile(new URL(name, REFERENCE_ROOT), "utf-8");
}

describe("work-artifacts skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-001
	it("routes direct fixes to regression tests and planned work to spec plus plan", async () => {
		const workflowTiers = await readReference("workflow-tiers.md");
		const planFormat = await readReference("plan-format.md");

		expect(workflowTiers).toContain("## Direct Fix");
		expect(workflowTiers).toContain(
			"No `spec.md`, no `plan.md`, no `architecture.md`",
		);
		expect(workflowTiers).toContain("regression test is the behavior record");
		expect(workflowTiers).toContain("## Planned Feature / Refactor");
		expect(workflowTiers).toContain("Requires `spec.md`");
		expect(workflowTiers).toContain("Requires `plan.md`");
		expect(workflowTiers).toContain(
			"Do not force direct fixes through the full artifact stack.",
		);
		expect(planFormat).toContain("behavior-first `plan.md`");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-002
	it("keeps artifact knowledge in a routed reference set", async () => {
		const skill = await readSkill();
		const workflowTiers = await readReference("workflow-tiers.md");
		const specFormat = await readReference("spec-format.md");
		const planFormat = await readReference("plan-format.md");
		const architectureFormat = await readReference("architecture-format.md");
		const behaviorSpine = await readReference("behavior-spine.md");

		expect(skill).toContain("Canonical artifact rules live in `references/`.");
		expect(skill).toContain(
			"Role skills should route to this skill instead of duplicating full artifact rules.",
		);
		expect(workflowTiers).toContain("direct fix");
		expect(specFormat).toContain("`spec.md`");
		expect(planFormat).toContain("`plan.md`");
		expect(architectureFormat).toContain("`architecture.md`");
		expect(behaviorSpine).toContain("@cosmo-behavior plan:<slug>#B-###");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-007
	it("describes quality contracts as abstract gate ladders without concrete tools", async () => {
		const gateContracts = await readReference("gate-contracts.md");
		const planFormat = await readReference("plan-format.md");
		const gateGuidance = `${gateContracts}\n${planFormat}`;

		expect(gateContracts).toContain("ordered abstract gate ladder");
		expect(gateContracts).toContain("`correctness`");
		expect(gateContracts).toContain("`artifact-conformance`");
		expect(gateContracts).toContain("`mutation`");
		expect(gateContracts).toContain("`duplication`");
		expect(gateContracts).toContain("`complexity`");
		expect(gateContracts).toContain("`boundary-conformance`");
		expect(gateContracts).toContain("`dead-code`");
		expect(planFormat).toContain("## Quality Contract");
		expect(planFormat).toContain("| Order | Gate kind | Tier | Binding state");
		expect(gateGuidance).not.toContain("| Tool |");
		expect(gateGuidance).not.toContain("| Command |");
		expect(gateGuidance).not.toMatch(/\b(fallow|biome|vitest|reek)\b/i);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-008
	it("defines binding states tiers protocol slot and explicit degradation", async () => {
		const gateContracts = await readReference("gate-contracts.md");

		expect(gateContracts).toContain("Binding state");
		expect(gateContracts).toContain("`bound`");
		expect(gateContracts).toContain("`unbound`");
		expect(gateContracts).toContain("Tier");
		expect(gateContracts).toContain("`universal`");
		expect(gateContracts).toContain("`bindable`");
		expect(gateContracts).toContain("protocol slot");
		expect(gateContracts).toContain("unbound bindable gate");
		expect(gateContracts).toContain("explicit degraded state");
		expect(gateContracts).toContain("never a silent pass");
		expect(gateContracts).toContain("never a hard failure");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-011
	it("allows approved visual primitives and forbids ascii art diagrams", async () => {
		const visualPrimitives = await readReference("visual-primitives.md");

		expect(visualPrimitives).toContain("Mermaid");
		expect(visualPrimitives).toContain("tables");
		expect(visualPrimitives).toContain("structured lists");
		expect(visualPrimitives).toContain("checklists");
		expect(visualPrimitives).toContain("ASCII-art diagrams are forbidden");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-015
	it("ships examples for direct tactical planned and architecture-linked workflows", async () => {
		const examples = await readReference("examples.md");

		expect(examples).toContain("## Direct Fix Template");
		expect(examples).toContain("## Tactical Bugfix Template");
		expect(examples).toContain("## Planned Feature / Refactor Template");
		expect(examples).toContain("## Architecture-Linked Multi-Plan Template");
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-020
	it("directly links reference files and follows creating-skills dispatcher discipline", async () => {
		const skill = await readSkill();

		expect(skill).toContain("thin dispatcher");
		expect(skill).toContain("Load exactly the references needed");
		expect(skill).toContain("Do not hide a needed file behind another file.");

		for (const reference of REQUIRED_REFERENCES) {
			expect(skill).toContain(`references/${reference}`);
		}
	});
});
