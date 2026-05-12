import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const skillPath = join(
	process.cwd(),
	"domains",
	"shared",
	"skills",
	"agent-packaging",
	"SKILL.md",
);

async function readSkill(): Promise<string> {
	return readFile(skillPath, "utf-8");
}

describe("agent-packaging skill", () => {
	test("exists as a non-empty directory skill with agent-packaging frontmatter", async () => {
		const content = await readSkill();

		expect(content.trim().length).toBeGreaterThan(0);
		expect(content).toMatch(/^---\n[\s\S]*^name:\s*agent-packaging$/m);
		expect(content).toMatch(/^description:\s*.+$/m);
	});

	test("contains the required conversational package-authoring guidance", async () => {
		const content = await readSkill();

		expect(content).toMatch(/source agent/i);
		expect(content).toMatch(/inspect/i);
		expect(content).toMatch(/unavailable .*tools/i);
		expect(content).toMatch(/target runtime/i);
		expect(content).toMatch(/external-safe prompt/i);
		expect(content).toMatch(/human/i);
		expect(content).toMatch(/AgentPackageDefinition/);
		expect(content).toMatch(/skills/i);
		expect(content).toMatch(/tool policy/i);
		expect(content).toMatch(
			/cosmonauts export --definition <path> --out <path>/,
		);
	});

	test("warns against blind raw export of internal prompts with unavailable Cosmonauts tools", async () => {
		const content = await readSkill();

		expect(content).toMatch(/warn|do not|never/i);
		expect(content).toMatch(/blindly exporting|blind raw|raw export/i);
		expect(content).toContain("spawn_agent");
		expect(content).toContain("chain_run");
		expect(content).toContain("drive");
	});
});
