import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderIdentityMarkdown } from "../../lib/harness-adapters/render.ts";

const repositoryRoot = process.cwd();
const nativePath = join(
	repositoryRoot,
	"domains/shared/skills/skills-cli/SKILL.md",
);
const migratedPath = join(repositoryRoot, ".claude/skills/skills-cli/SKILL.md");

describe("skills-cli skill", () => {
	test("uses a read-only JSON harness check instead of a hand-authored path table", async () => {
		const native = await readFile(nativePath, "utf8");

		expect(native).toContain("cosmonauts harness --json sync --check");
		expect(native).not.toMatch(/\|\s*Target\s*\|\s*Project directory\s*\|/);
		expect(native).not.toContain(".claude/skills/<name>/");
		expect(native).not.toContain(".agents/skills/<name>/");
	});

	test("keeps the migrated obsolete-path copy byte-derived from the corrected native source", async () => {
		const [native, migrated] = await Promise.all([
			readFile(nativePath),
			readFile(migratedPath),
		]);

		expect(migrated).toEqual(renderIdentityMarkdown(native));
	});
});
