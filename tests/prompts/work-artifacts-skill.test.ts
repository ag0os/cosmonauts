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
	"deviation-protocol.md",
] as const;

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

async function readReference(name: (typeof REQUIRED_REFERENCES)[number]) {
	return readFile(new URL(name, REFERENCE_ROOT), "utf-8");
}

describe("work-artifacts skill", () => {
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

	it("allows approved visual primitives and forbids ascii art diagrams", async () => {
		const visualPrimitives = await readReference("visual-primitives.md");

		expect(visualPrimitives).toContain("Mermaid");
		expect(visualPrimitives).toContain("tables");
		expect(visualPrimitives).toContain("structured lists");
		expect(visualPrimitives).toContain("checklists");
		expect(visualPrimitives).toContain("ASCII-art diagrams are forbidden");
	});

	it("requires an intent section with ranked invariants in spec format", async () => {
		const specFormat = await readReference("spec-format.md");

		expect(specFormat).toContain("- `## Intent`");
		expect(specFormat).toContain("`## Purpose` stays narrative");
		expect(specFormat).toContain("Goal: <one sentence");
		expect(specFormat).toContain("INV-###");
		expect(specFormat).toContain("outrank any mechanism");
		expect(specFormat).toContain(
			"Invariants are ratified ground: changing one is always a human decision.",
		);
		expect(specFormat).toContain(
			"Where two invariants can conflict, state the ranking",
		);
		expect(specFormat).toContain("`deviation-protocol.md`");
	});

	it("requires a decision log with provenance-derived mutability in plan format", async () => {
		const planFormat = await readReference("plan-format.md");

		expect(planFormat).toContain("- `## Decision Log`");
		expect(planFormat).toContain("Every full plan has `## Decision Log`.");
		expect(planFormat).toContain("Decision:");
		expect(planFormat).toContain("Alternatives:");
		expect(planFormat).toContain("Why:");
		expect(planFormat).toContain("Decided by:");
		expect(planFormat).toContain("Supersedes:");
		expect(planFormat).toContain(
			"Mutability follows from `Decided by:` provenance",
		);
		expect(planFormat).toContain("treated as ratified");
		expect(planFormat).toContain("write it only when overriding");
		expect(planFormat).toContain(
			"Plans cite spec invariants by `INV-###` ID and do not restate intent",
		);
	});

	it("defines the deviation classifier and amend-on-record protocol", async () => {
		const protocol = await readReference("deviation-protocol.md");

		expect(protocol).toContain("The plan is the thing you amend on the record");
		expect(protocol).toContain(
			"**snap back / amend-on-record / halt-and-escalate / record**",
		);
		expect(protocol).toContain("`ratified`");
		expect(protocol).toContain("`derived`");
		expect(protocol).toContain("Always ratified, regardless of markers");
		expect(protocol).toContain("Write the decision first");
		expect(protocol).toContain("honestly rejected alternative");
		expect(protocol).toContain("(superseded by D-###, <date>)");
		expect(protocol).toContain(
			"A finding is evidence; its suggested fix is an alternative to weigh",
		);
		expect(protocol).toContain("Split compound findings");
		expect(protocol).toContain(
			"Changing a test's expected behavior to make the change green",
		);
		expect(protocol).toContain("never work from memory of the plan");
	});

	it("routes deviation handling to the deviation protocol reference", async () => {
		const skill = await readSkill();

		expect(skill).toContain("references/deviation-protocol.md");
		expect(skill).toContain("deviation classifier");
		expect(skill).toContain("amend-on-record");
	});

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
