import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/architecture/SKILL.md",
	import.meta.url,
);
const ARCHITECTURE_FORMAT_PATH = new URL(
	"../../domains/shared/skills/work-artifacts/references/architecture-format.md",
	import.meta.url,
);
const PLAN_FORMAT_PATH = new URL(
	"../../domains/shared/skills/work-artifacts/references/plan-format.md",
	import.meta.url,
);

async function readSkill() {
	return readFile(SKILL_PATH, "utf-8");
}

async function readArchitectureFormat() {
	return readFile(ARCHITECTURE_FORMAT_PATH, "utf-8");
}

async function readPlanFormat() {
	return readFile(PLAN_FORMAT_PATH, "utf-8");
}

describe("architecture skill", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-009
	it("requires missions architecture location decision log boundary model and usefulness rule", async () => {
		const skill = await readSkill();
		const architectureFormat = await readArchitectureFormat();
		const guidance = `${skill}\n${architectureFormat}`;

		expect(skill).toContain("thin dispatcher");
		expect(skill).toContain("/skill:work-artifacts");
		expect(skill).toContain("references/architecture-format.md");
		expect(skill).toContain("route architecture-record format details");
		expect(guidance).toContain("missions/architecture/<slug>.md");
		expect(guidance).toContain("## Decision Log");
		expect(guidance).toContain("## Boundary Model");
		expect(guidance).toContain(
			"Create it only when durable boundaries, dependency rules, or multi-plan decisions will change how workers implement or reviewers evaluate the work.",
		);
		expect(guidance).toContain(
			"If the record would not change implementation or review, do not create it.",
		);
		expect(guidance).toContain(
			"Do not store architecture-of-record content inside an implementation plan.",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-010
	it("requires Architecture Context and distinguishes architecture from memory", async () => {
		const architectureFormat = await readArchitectureFormat();
		const planFormat = await readPlanFormat();
		const guidance = `${architectureFormat}\n${planFormat}`;

		expect(guidance).toContain("## Architecture Context");
		expect(guidance).toContain(
			"when the plan depends on a durable architecture record",
		);
		expect(guidance).toContain("Relevant decisions");
		expect(guidance).toContain("Boundary rules this plan must preserve");
		expect(guidance).toContain(
			"architecture.md` is active, authoritative implementation context",
		);
		expect(guidance).toContain(
			"`memory/` is post-completion distilled knowledge",
		);
		expect(guidance).toContain(
			"Do not replace an active boundary record with memory notes.",
		);
	});

	it("avoids ordinary plans memory distillation and background design notes", async () => {
		const skill = await readSkill();

		expect(skill).toContain("Do NOT load for ordinary implementation plans");
		expect(skill).toContain("post-completion memory distillation");
		expect(skill).toContain("background design notes");
		expect(skill).toContain("Capturing lessons after work completes");
		expect(skill).toContain("Use post-completion memory flow, not this skill.");
		expect(skill).toContain(
			"A record would not change implementation or review",
		);
	});
});
