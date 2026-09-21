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

describe("task skill deviation routing", () => {
	it("routes mid-implementation acceptance criteria changes through the deviation classifier", async () => {
		const content = await readSkill();

		expect(content).toContain(
			"**Acceptance criteria turn out to be wrong mid-implementation.**",
		);
		expect(content).toContain("Classify the change first via");
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain(
			"halt-and-escalate with a drafted decision entry",
		);
		expect(content).toContain("derived plan ground is updated on the record");
		expect(content).toContain("silently working around them is drift");
	});
});

describe("task skill", () => {
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
