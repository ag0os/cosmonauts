import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const ACTIVE_GUIDANCE_PATHS = [
	"README.md",
	"docs/orchestration.md",
	"lib/driver/README.md",
	"domains/shared/capabilities/drive.md",
	"domains/shared/capabilities/spawning.md",
	"domains/shared/skills/drive/SKILL.md",
	"domains/shared/skills/spawning/SKILL.md",
	"external-skills/cosmonauts/SKILL.md",
	"external-skills/cosmonauts/chains/SKILL.md",
	"external-skills/cosmonauts/plans/SKILL.md",
	"external-skills/cosmonauts/tasks/SKILL.md",
	"external-skills/cosmonauts/skills/SKILL.md",
] as const;

async function readRepoFile(path: string): Promise<string> {
	return readFile(new URL(`../../${path}`, import.meta.url), "utf-8");
}

async function readActiveGuidance(): Promise<string> {
	const contents = await Promise.all(ACTIVE_GUIDANCE_PATHS.map(readRepoFile));
	return contents.join("\n");
}

describe("orchestration surface guidance", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-018
	test("documents cosmonauts run named chains and normalized observation without removed orchestration flags", async () => {
		const content = await readActiveGuidance();

		expect(content).toContain("cosmonauts run chain");
		expect(content).toContain("cosmonauts run drive");
		expect(content).toContain("cosmonauts run status");
		expect(content).toContain("cosmonauts run watch");
		expect(content).toContain("named chains");
		expect(content).toContain("runId");
		expect(content).toContain("run_status");
		expect(content).toContain("run_watch");
		expect(content).toContain("watch_events");
		expect(content).toMatch(/compatibility/i);
		expect(content).toContain("missions/sessions/<scope>/runs/<runId>/");
		expect(content).toContain("spawn_agent");
		expect(content).toContain("agent-only");

		expect(content).not.toMatch(/--workflow\b/);
		expect(content).not.toMatch(/--list-workflows\b/);
		expect(content).not.toMatch(/\bcosmonauts-workflows\b/);
		expect(content).not.toMatch(/\bcosmonauts drive\b/);
	});
});
