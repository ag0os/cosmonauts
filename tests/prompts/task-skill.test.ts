import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/task/SKILL.md",
	import.meta.url,
);
const CAPABILITY_PATH = new URL(
	"../../domains/shared/capabilities/tasks.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

async function readCapabilities() {
	return readFile(CAPABILITY_PATH, "utf-8");
}

describe("task skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-002
	it("owns task lifecycle guidance while routing artifact format details to work-artifacts", async () => {
		const content = await readSkill();

		expect(content).toContain("## Task File Format");
		expect(content).toContain("## Status Flow");
		expect(content).toContain("## Tool Reference");
		expect(content).toContain("## Dependencies");
		expect(content).toContain("## Writing Acceptance Criteria");
		expect(content).toContain("For artifact-format details");
		expect(content).toContain("load `/skill:work-artifacts`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain(
			"Do not duplicate canonical artifact rules here.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-006
	it("preserves planned behavior ownership and marker expectations in task acceptance criteria", async () => {
		const content = await readSkill();

		expect(content).toContain("## Planned Behavior Ownership");
		expect(content).toContain(
			"Every `B-###` behavior or behavior cluster from the plan must be assigned to at least one task.",
		);
		expect(content).toContain(
			"Task ACs that own planned behavior must name the owned `B-###` IDs.",
		);
		expect(content).toContain(
			"Carry the worker's marker expectation into the task context",
		);
		expect(content).toContain("@cosmo-behavior plan:<slug>#B-###");
		expect(content).toContain(
			"Do not ask workers to invent missing artifact architecture, behavior IDs, seams, tests, or markers.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-020
	it("stays a directly linked dispatcher without deep task references", async () => {
		const content = await readSkill();

		expect(content).toContain("dispatcher");
		expect(content).toContain("directly linked reference");
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).not.toContain("references/lifecycle.md");
		expect(content).not.toContain("references/behavior-mapping.md");
	});

	it("allows tactical bugfix tasks to use regression tests as behavior records", async () => {
		const content = await readSkill();

		expect(content).toContain("## Tactical Bugfix Tasks");
		expect(content).toContain("regression test is the behavior record");
		expect(content).toContain(
			"Do not require a full `spec.md`, `plan.md`, or `architecture.md` stack",
		);
		expect(content).toContain(
			"No `B-###` behavior ID or marker is required unless the bugfix belongs to an active plan.",
		);
	});

	// @cosmo-behavior plan:task-id-system#B-011
	it("documents readable sequential task ID caveats across task docs", async () => {
		const docs = [await readSkill(), await readCapabilities()];

		for (const content of docs) {
			expect(content).toContain("sequential and human-readable");
			expect(content).toContain("configured prefix");
			expect(content).toContain("active task frontmatter");
			expect(content).toContain("archived task filenames");
			expect(content).toContain("not branch-global");
			expect(content).toContain("Cross-branch duplicate IDs");
			expect(content).toContain("accepted caveat");
			expect(content).toContain("`cosmonauts task renumber`");
			expect(content).toContain("FUTURE-only");
			expect(content).toContain("not implemented");
		}
	});
});
