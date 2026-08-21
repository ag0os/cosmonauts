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
const MEMORY_DOC_PATH = new URL("../../docs/memory.md", import.meta.url);
const README_PATH = new URL("../../README.md", import.meta.url);
const ROADMAP_PATH = new URL("../../ROADMAP.md", import.meta.url);
const AGENTS_PATH = new URL("../../AGENTS.md", import.meta.url);
const CONFIG_EXAMPLE_PATH = new URL(
	"../../.cosmonauts/config.example.json",
	import.meta.url,
);
const SCAN_EVIDENCE_PATH = new URL(
	"../../missions/reviews/knowledge-surface-scan-cost.md",
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
			// Proposal-only output: guidance must not ALSO instruct writing the
			// retired root distillation. Asserting the proposal wording is present
			// is not enough — a contradicting legacy instruction can sit beside it.
			expect(guidance).not.toMatch(
				/write\s+to\s+`?memory\/<(?:plan)?[Ss]lug>\.md`?/i,
			);
			expect(guidance).not.toMatch(
				/\*\*Location\*\*:\s*`?memory\/`?\s+at the project root/i,
			);
		}

		expect(definition).toContain('id: "distiller"');
		expect(definition).toMatch(/OKF proposal/);
		expect(definition).not.toMatch(/JSONL|SQLite|embedding/i);
	});

	it("documents the stack-agnostic knowledge surface budget gate authority host scope and exclusions @cosmo-behavior plan:knowledge-surface#B-011", async () => {
		const [
			memoryDoc,
			readme,
			roadmap,
			agents,
			archiveSkill,
			configExample,
			scan,
		] = await Promise.all([
			readFile(MEMORY_DOC_PATH, "utf-8"),
			readFile(README_PATH, "utf-8"),
			readFile(ROADMAP_PATH, "utf-8"),
			readFile(AGENTS_PATH, "utf-8"),
			readFile(SKILL_PATH, "utf-8"),
			readFile(CONFIG_EXAMPLE_PATH, "utf-8"),
			readFile(SCAN_EVIDENCE_PATH, "utf-8"),
		]);
		const livePointers = [readme, roadmap, agents, archiveSkill];

		for (const pointer of livePointers) {
			expect(pointer).toContain("knowledge/");
			expect(pointer).not.toContain(".knowledge.jsonl");
		}
		expect(memoryDoc).toContain("<projectRoot>/knowledge/");
		expect(memoryDoc).toContain("~/.cosmonauts/knowledge/");
		expect(memoryDoc).toMatch(
			/reads? do(?:es)? not create|no read-time scaffolding/i,
		);
		expect(memoryDoc).toMatch(/no project seed[^.]+user/i);

		expect(memoryDoc).toMatch(/minimal human OKF/i);
		expect(memoryDoc).toMatch(
			/full machine provenance[^.]+writer[^.]+source[^.]+date/is,
		);
		for (const type of ["decision", "trade-off", "gotcha", "convention"]) {
			expect(memoryDoc).toContain(`\`${type}\``);
		}
		expect(memoryDoc).toContain("memory/agent/proposals/");
		expect(memoryDoc).toMatch(/distilled[^.]+non-verbatim[^.]+attributable/i);
		expect(memoryDoc).toMatch(/promotion[^.]+human act/i);
		expect(memoryDoc).toMatch(/Stage\s+7[^.]+approval[^.]+not promotion/i);
		expect(memoryDoc).toMatch(/shared `recall`/i);

		expect(memoryDoc).toContain("24,000");
		expect(memoryDoc).toMatch(/scan statistics/i);
		expect(memoryDoc).toContain("413");
		expect(memoryDoc).toContain("423,016");
		expect(scan).toContain("verdict: pass");
		expect(scan).toContain("turns: 20");

		expect(memoryDoc).toMatch(/enabled only when[^.]+literally true/i);
		expect(memoryDoc).toMatch(/OFF by default/);
		expect(memoryDoc).toMatch(/reload[^.]+plain new[^.]+frozen/is);
		expect(memoryDoc).toMatch(/restart[^.]+`\/agent`[^.]+adopt/is);
		expect(memoryDoc).toMatch(/every Cosmonauts-assembled agent/i);
		expect(memoryDoc).toMatch(
			/bare Pi package hosts?[^.]+outside[^.]+enabled contract/i,
		);
		expect(memoryDoc).toMatch(/while\s+OFF[^.]+baseline/is);
		expect(JSON.parse(configExample)).toMatchObject({
			knowledgeSurface: { enabled: false },
		});

		expect(memoryDoc).toMatch(
			/dedicated knowledge[^.]+memory[^.]+`MemoryStore`/i,
		);
		expect(memoryDoc).toMatch(/existing narrow legacy authorization remains/i);
		expect(memoryDoc).toMatch(/generic Pi project tools/i);
		expect(memoryDoc).toMatch(
			/Codex[^.]+Claude[^.]+human-supervised[^.]+git-reviewed/is,
		);
		expect(memoryDoc).toMatch(/deliberately\s+unsandboxed/i);
		expect(memoryDoc).toMatch(
			/matching profile[^.]+outside[^.]+combined recall limit/i,
		);

		const normalizedMemoryDoc = memoryDoc.toLowerCase().replace(/\s+/g, " ");
		for (const exclusion of [
			"consolidation",
			"working state",
			"episodic log",
			"explicit save",
			"embeddings",
			"similarity backend",
			"retention",
			"raw-session deletion",
			"autonomy-host behavior",
			"enabled bare-host promise",
			"cache",
			"registry correctness state",
		]) {
			expect(normalizedMemoryDoc, exclusion).toContain(exclusion);
		}

		for (const guidance of [
			archiveSkill,
			await readFile(DISTILLER_PROMPT_PATH, "utf-8"),
		]) {
			expect(guidance).toMatch(/stack-agnostic/i);
			expect(guidance).not.toMatch(/React|Rails|TypeScript|Python|Java|Rust/);
		}
	});
});
