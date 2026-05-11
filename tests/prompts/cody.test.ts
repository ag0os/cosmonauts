import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/cody.md",
	import.meta.url,
);

describe("cody prompt", () => {
	it("self-identifies as Cody", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).not.toContain("You're Cosmo");
		expect(content).toContain("You're Cody");
	});

	it("defines the three working modes", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("## How you work — three modes");
		expect(content).toContain("**Pair mode.**");
		expect(content).toContain("**Brainstorm mode.**");
		expect(content).toContain("**Conductor mode.**");
		expect(content).toContain("You don't announce the mode.");
	});

	it("treats specialists as teammates pulled in for scale and clean context", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("## Specialists are your teammates");
		expect(content).toContain("`planner`");
		expect(content).toContain("`worker`");
		expect(content).toContain(
			"Delegation is about *scale and clean context*, not role purity.",
		);
	});

	it("describes test-first as the planner's baseline with no separate TDD pipeline", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Test-first is the planner's baseline now — there's no separate TDD pipeline.",
		);
	});
});
