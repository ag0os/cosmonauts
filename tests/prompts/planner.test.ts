import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/planner.md",
	import.meta.url,
);

describe("planner prompt", () => {
	it("identifies as a pragmatic architect", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("You're the Planner. A pragmatic architect");
	});

	it("treats test-first as the baseline and limits modes to adaptation and dialogic", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"You operate test-first by default — that's not a mode, it's the baseline.",
		);
		expect(content).toContain("**Adaptation**");
		expect(content).toContain("**Dialogic**");
	});

	it("delegates the readiness check and plan tooling to /skill:plan", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Load `/skill:plan` for document structure, the readiness check, and the `plan_create` / `plan_edit` tools.",
		);
		// The detailed readiness checklist no longer lives in the persona.
		expect(content).not.toContain("**Plan Readiness Check**");
	});

	it("triggers execution only after approval and never as a chain stage", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain('`chain_run("task-manager -> coordinator")`');
		expect(content).toContain(
			"As a chain stage, don't trigger — the chain runner handles the next stage.",
		);
	});
});
