import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/worker.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("worker prompt", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-005
	it("distinguishes planned behavior TDD markers from direct fix regression tests", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"When a task owns planned `B-###` behaviors, load `/skill:tdd`",
		);
		expect(content).toContain(
			"Planned behavior RED tests must carry the matching `@cosmo-behavior plan:<slug>#B-###` marker near the executable test.",
		);
		expect(content).toContain(
			"Direct fixes still require a regression test first",
		);
		expect(content).toContain(
			"no marker ceremony unless the fix is tied to a plan",
		);
		expect(content).not.toMatch(/runtime marker scanning/i);
		expect(content).not.toMatch(/gate enforcement/i);
	});
});
