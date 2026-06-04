import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/reviewer.md",
	import.meta.url,
);

async function readPrompt() {
	return readFile(PROMPT_PATH, "utf-8");
}

describe("reviewer prompt", () => {
	it("resolves the fallback base local-first so origin-behind state does not widen the range", async () => {
		const content = await readPrompt();

		// When the reviewer computes its own scope, it resolves the local base
		// branch before origin/main; a local main ahead of origin/main stays the
		// true fork point so already-merged commits stay out of the review range.
		expect(content).toContain(
			"Resolve base: `main` → `master` → `origin/main`. The local base branch is the true fork point; `origin/main` is only a fallback when no local `main` or `master` exists.",
		);
		expect(content).not.toContain(
			"Resolve base: `origin/main` → `main` → `master`",
		);
	});

	// @cosmo-behavior plan:artifact-format-redesign#B-017
	it("loads work-artifacts for artifact-conformance scope without inventing extra review claims", async () => {
		const content = await readPrompt();

		expect(content).toContain(
			"when the spawn prompt includes plan context, `Quality Contract Criteria`, or explicit artifact-conformance claims",
		);
		expect(content).toContain("load `/skill:work-artifacts`");
		expect(content).toContain("behavior marker");
		expect(content).toContain("Architecture Context");
		expect(content).toContain("gate-ladder claims");
		expect(content).toContain(
			"Do not invent artifact-conformance requirements for ordinary code review scopes",
		);
		expect(content).toContain(
			"Only report artifact findings for claims or plan contracts that the review prompt actually placed in scope.",
		);
	});
});
