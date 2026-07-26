import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/worker.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("worker prompt", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-009
	it("routes plan deviations through the classifier with drafted escalations", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("classify before you code");
		expect(content).toContain(
			"`snap back / amend-on-record / halt-and-escalate / record`",
		);
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain("Blocked with a drafted decision entry");
		expect(content).toContain(
			"surface every amendment by its decision ID",
		);
		expect(content).toContain(
			"the deviation classifier leaves the call to you",
		);
		expect(content).toContain(
			"Never change a test's expected behavior to make your change green",
		);
	});

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
