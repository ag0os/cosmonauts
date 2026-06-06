import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createRunProgram } from "../../cli/run/subcommand.ts";
import { KNOWN_BACKEND_NAMES } from "../../lib/durable-runtime/types.ts";

const DEFERRED_SURFACE_GUIDANCE_PATHS = [
	"docs/orchestration.md",
	"domains/shared/capabilities/spawning.md",
	"domains/shared/skills/spawning/SKILL.md",
	"external-skills/cosmonauts/chains/SKILL.md",
] as const;

async function readRepoFile(path: string): Promise<string> {
	return readFile(new URL(`../../${path}`, import.meta.url), "utf-8");
}

describe("orchestration surface non-goals", () => {
	// @cosmo-behavior plan:orchestration-surface-consolidation#B-019
	test("keeps nested-run parent fields run spawn and new mutable-parallel surfaces out of wave two", async () => {
		const durableTypes = await readRepoFile("lib/durable-runtime/types.ts");
		const runRecordBlock = durableTypes.match(
			/export interface RunRecord \{[\s\S]*?\n\}/,
		)?.[0];
		expect(runRecordBlock).toBeDefined();

		expect(KNOWN_BACKEND_NAMES).not.toContain("nested-run");
		expect(runRecordBlock).not.toMatch(/\bkind\b/);
		expect(runRecordBlock).not.toContain("parentRunId");
		expect(runRecordBlock).not.toContain("parentStepId");
		expect(
			createRunProgram().commands.map((command) => command.name()),
		).not.toContain("spawn");

		const deferredGuidance = (
			await Promise.all(DEFERRED_SURFACE_GUIDANCE_PATHS.map(readRepoFile))
		).join("\n");
		expect(deferredGuidance).not.toContain("nested-run");
		expect(deferredGuidance).not.toContain("parentRunId");
		expect(deferredGuidance).not.toContain("parentStepId");
		expect(deferredGuidance).not.toMatch(/\bcosmonauts run spawn\b/);
		expect(deferredGuidance).not.toMatch(/mutable parallel task dispatch/i);
		expect(deferredGuidance).not.toMatch(/worktree isolation/i);
		expect(deferredGuidance).not.toMatch(/merge finalization/i);
		expect(deferredGuidance).not.toMatch(/approval-gate execution/i);
		expect(deferredGuidance).not.toMatch(/fan-out cap/i);

		expect(durableTypes).toContain('"approval"');
		expect(durableTypes).toContain("interface WorktreeSpec");
		expect(durableTypes).toContain("maxParallelSteps");
	});
});
