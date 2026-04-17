import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PROMPT_PATH = new URL(
	"../../bundled/coding/coding/prompts/cosmo.md",
	import.meta.url,
);

describe("cosmo prompt", () => {
	it("defines the three planning routes and their signals", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain("`spec-writer`");
		expect(content).toContain("`cosmo-facilitates-dialogue`");
		expect(content).toContain("`planner-autonomous`");
		expect(content).toContain(
			"Idea is fuzzy, no spec exists, or the work still needs product framing (WHAT/WHY, users, experience)",
		);
		expect(content).toContain(
			"User wants interactive design dialogue with you, or the request is concrete enough for architecture back-and-forth (HOW, modules, contracts)",
		);
		expect(content).toContain(
			'User says "just decide", "go ahead", or "commit"; the run is non-interactive; or your dialogue has already settled direction',
		);
	});

	it("keeps the route announcement template", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"Route: <spec-writer|cosmo-facilitates-dialogue|planner-autonomous>",
		);
		expect(content).toContain("Why: <signal(s) that triggered this route>");
		expect(content).toContain(
			"Next: <spawn spec-writer | facilitate design dialogue here, then spawn planner | spawn planner autonomously now>",
		);
	});

	it("preserves planner bypass and direct planner dialogue wording", async () => {
		const content = await readFile(PROMPT_PATH, "utf-8");

		expect(content).toContain(
			"If you already know the technical shape, I can bypass spec-writer and go straight to planner.",
		);
		expect(content).toContain(
			'If you want planner-led dialogue instead, use cosmonauts -a planner "...".',
		);
	});
});
