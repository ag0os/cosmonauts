import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/plan-reviewer.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("plan-reviewer prompt", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-016
	it("reviews full plans against the canonical work artifact contract", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"For non-trivial planned feature/refactor reviews, load `/skill:work-artifacts`",
		);
		expect(content).toContain("`references/workflow-tiers.md`");
		expect(content).toContain("`references/plan-format.md`");
		expect(content).toContain("`references/architecture-format.md`");
		expect(content).toContain("`references/behavior-spine.md`");
		expect(content).toContain("`references/gate-contracts.md`");
		expect(content).toContain("behavior IDs");
		expect(content).toContain("`@cosmo-behavior plan:<slug>#B-###` markers");
		expect(content).toContain("source `AC-###` links");
		expect(content).toContain("seams");
		expect(content).toContain("named tests");
		expect(content).toContain("design is derived from the behavior spine");
		expect(content).toContain("architecture record is useful");
		expect(content).toContain("`## Architecture Context`");
		expect(content).toContain("ordered abstract gate ladder");
		expect(content).toContain("without concrete tool-name or command columns");
		expect(content).toContain(
			"Do not require artifact-contract findings for direct fixes, tactical bugfixes, or work where the artifact contract is not in scope.",
		);
		expect(content).not.toMatch(/\b(vitest|biome|fallow|tsc)\b/i);
	});
});
