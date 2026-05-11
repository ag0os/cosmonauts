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
	it("turns plan behaviors into acceptance criteria on normal tasks", async () => {
		const content = await readPrompt();

		expect(content).toContain("**Behaviors become acceptance criteria.**");
		expect(content).toContain(
			"Each behavior — or behavior cluster — that a task covers must show up in that task's ACs as a verifiable outcome.",
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
