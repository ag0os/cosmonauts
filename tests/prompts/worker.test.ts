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
		const content = await readPrompt();

		expect(content).toContain("classify before you code");
		expect(content).toContain(
			"`snap back / amend-on-record / halt-and-escalate / record`",
		);
		expect(content).toContain("`references/deviation-protocol.md`");
		expect(content).toContain("Blocked with a drafted decision entry");
		expect(content).toContain("surface every amendment by its decision ID");
		expect(content).toContain(
			"the deviation classifier leaves the call to you",
		);
		expect(content).toContain(
			"Never change a test's expected behavior to make your change green",
		);
	});
});
