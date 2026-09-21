import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);

async function read(path: string) {
	return readFile(new URL(path, ROOT), "utf-8");
}

const ANALYSIS_ROLE_PROMPTS = [
	"verifier",
	"fixer",
	"planner",
	"plan-reviewer",
	"worker",
	"refactorer",
].map((role) => `bundled/coding/prompts/${role}.md`);

describe("shipped guidance stays provider- and stack-neutral", () => {
	it.each(
		ANALYSIS_ROLE_PROMPTS,
	)("%s names no analysis provider", async (path) => {
		expect(await read(path)).not.toMatch(/\bfallow\b/iu);
	});

	it("spec-writer names no toolchain", async () => {
		expect(await read("bundled/coding/prompts/spec-writer.md")).not.toMatch(
			/\b(vitest|biome|fallow|tsc)\b/i,
		);
	});

	it.each([
		"domains/shared/skills/archive/SKILL.md",
		"bundled/coding/prompts/distiller.md",
	])("%s names no language or framework", async (path) => {
		expect(await read(path)).not.toMatch(
			/React|Rails|TypeScript|Python|Java|Rust/,
		);
	});
});
