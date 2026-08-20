import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const SKILL_PATH = new URL(
	"../../domains/shared/skills/archive/SKILL.md",
	import.meta.url,
);
const DISTILLER_DOMAIN = ["cod", "ing"].join("");
const DISTILLER_PROMPT_PATH = new URL(
	`../../bundled/${DISTILLER_DOMAIN}/prompts/distiller.md`,
	import.meta.url,
);
const DISTILLER_DEFINITION_PATH = new URL(
	`../../bundled/${DISTILLER_DOMAIN}/agents/distiller.ts`,
	import.meta.url,
);

describe("archive skill", () => {
	// @cosmo-behavior plan:spec-plan-intent#B-014
	it("distills supersessions and amend-on-record decisions into key decisions", async () => {
		const content = await readFile(SKILL_PATH, "utf-8");

		expect(content).toContain("supersessions and amend-on-record decisions");
		expect(content).toContain("what it replaced");
	});

	it("requires active and archived Tier-2 discovery and attributable distilled OKF proposals @cosmo-behavior plan:knowledge-surface#B-009", async () => {
		const [skill, prompt, definition] = await Promise.all([
			readFile(SKILL_PATH, "utf-8"),
			readFile(DISTILLER_PROMPT_PATH, "utf-8"),
			readFile(DISTILLER_DEFINITION_PATH, "utf-8"),
		]);

		for (const guidance of [skill, prompt]) {
			expect(guidance).toContain("missions/sessions/<planSlug>/manifest.json");
			expect(guidance).toContain(
				"missions/archive/sessions/<planSlug>/manifest.json",
			);
			expect(guidance).toMatch(/union/i);
			expect(guidance).toMatch(/path-deduplicat/i);
			expect(guidance).toContain("transcriptFile");
			expect(guidance).toContain(".transcript.md");
			expect(guidance).toMatch(/only when neither[^.]+transcript/is);
			expect(guidance).toMatch(/fall back[^.]+plan[^.]+tasks?/is);
			expect(guidance).toContain("3–15");
			expect(guidance).toMatch(/one concept/i);
			expect(guidance).toContain("OKF v0.1 markdown");
			for (const type of ["decision", "trade-off", "gotcha", "convention"]) {
				expect(guidance).toContain(`\`${type}\``);
			}
			for (const provenance of ["writer", "source", "date"]) {
				expect(guidance).toMatch(
					new RegExp(`full[^.]*provenance[^.]*${provenance}`, "is"),
				);
			}
			expect(guidance).toContain("memory/agent/proposals/");
			expect(guidance).toMatch(/do not write JSONL/i);
			expect(guidance).toMatch(/do not create embeddings/i);
			expect(guidance).toMatch(
				/do not copy verbatim transcript, file, or command excerpts/i,
			);
			expect(guidance).toMatch(/promotion[^.]+human/i);
			expect(guidance).toMatch(/stack-agnostic/i);
			expect(guidance).not.toMatch(
				/\.knowledge\.jsonl|SQLite|vector embedding/i,
			);
		}

		expect(definition).toContain('id: "distiller"');
		expect(definition).toMatch(/OKF proposal/);
		expect(definition).not.toMatch(/JSONL|SQLite|embedding/i);
	});
});
