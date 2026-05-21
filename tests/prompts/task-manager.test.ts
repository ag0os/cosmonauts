import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/task-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("task-manager prompt", () => {
	// @cosmo-behavior plan:artifact-format-redesign#B-006
	it("preserves behavior IDs and marker expectations when turning behaviors into ACs", async () => {
		const content = await readPrompt();

		expect(content).toContain("**Behaviors become acceptance criteria.**");
		expect(content).toContain(
			"Each behavior — or behavior cluster — that a task covers must show up in that task's ACs as a verifiable outcome.",
		);
		expect(content).toContain(
			"Task ACs that own planned behavior must identify the owned `B-###` behavior IDs.",
		);
		expect(content).toContain(
			"Every `B-###` behavior or behavior cluster in the approved plan must be assigned to at least one task.",
		);
		expect(content).toContain(
			"Carry the worker's marker expectation into the task context",
		);
		expect(content).toContain("@cosmo-behavior plan:<slug>#B-###");
		expect(content).toContain(
			"Do not add scope outside the approved plan just to make a task easier to shape.",
		);
		expect(content).toContain("**Tactical bugfix tasks are different.**");
		expect(content).toContain("regression test is the behavior record");
		expect(content).toContain(
			"No `B-###` behavior ID or marker is required unless the bugfix belongs to an active plan.",
		);
	});

	it("does not expand behaviors into phase tasks", async () => {
		const content = await readPrompt();

		expect(content).not.toContain("phase:red");
		expect(content).not.toContain("phase:green");
		expect(content).not.toContain("phase:refactor");
		expect(content).not.toContain("## Test Targets");
		expect(content).not.toContain("## Implementation Pointers");
	});

	it("keeps the single-PR scope rule with 1-7 acceptance criteria", async () => {
		const content = await readPrompt();

		expect(content).toContain("single-PR scope");
		expect(content).toContain("1 to 7 acceptance criteria");
	});
});
