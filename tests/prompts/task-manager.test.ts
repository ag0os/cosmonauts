import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/task-manager.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("task-manager prompt", () => {
	it("carries ratified-ground constraints into task acceptance criteria", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("Carry mutability with the constraint");
		expect(content).toContain("stop-and-escalate ground");
		expect(content).toContain("not worker-adjustable detail");
		expect(content).toContain("`references/deviation-protocol.md`");
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
