import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/prompts/verifier.md",
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

	// @cosmo-behavior plan:artifact-format-redesign#B-018
	it("validates explicit artifact conformance claims without expanding scope", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"If the parent prompt includes explicit artifact-conformance claims",
		);
		expect(content).toContain("load `/skill:work-artifacts`");
		expect(content).toContain("behavior marker");
		expect(content).toContain("abstract Quality Contract gate ladder");
		expect(content).toContain(
			"Validate only the artifact-conformance claims the parent prompt provided.",
		);
		expect(content).toContain(
			"Do not scan for every possible marker, architecture rule, or gate-ladder issue unless that exact claim was provided.",
		);
		expect(content).toContain("result: pass | fail");
		expect(content).toContain("file:line");
	});
});
