import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/verifier.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("verifier prompt", () => {
	it("validates known claims and never modifies code", async () => {
		const content = await readPrompt();

		expect(content).toContain("You're the Verifier.");
		expect(content).toContain("you validate known claims the caller hands you");
		expect(content).toContain(
			"**Do NOT use bash or any tool to write, edit, or create files.**",
		);
	});

	it("produces binary pass/fail results with evidence", async () => {
		const content = await readPrompt();

		expect(content).toContain("result: pass | fail");
		expect(content).toContain("**Binary results.**");
		expect(content).toContain("**Show evidence.**");
	});

	it("no longer carries phase:red-verify named-test handling", async () => {
		const content = await readPrompt();

		expect(content).not.toContain("phase:red-verify");
		expect(content).not.toContain("observed_outcome");
		expect(content).not.toContain("assertion-failure");
	});
});
