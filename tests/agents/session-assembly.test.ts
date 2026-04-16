/**
 * Tests for the shared session parameter builder (buildSessionParams).
 *
 * Verifies prompt assembly, identity marker, tool resolution, extension paths,
 * skill overrides, model resolution, thinking level, and extraExtensionPaths.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractAgentIdFromSystemPrompt } from "../../lib/agents/runtime-identity.ts";
import {
	type BuildSessionParamsOptions,
	buildSessionParams,
} from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("session-assembly-");

// ============================================================================
// Helpers
// ============================================================================

/** Write files relative to the base directory. */
async function setupFiles(
	baseDir: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [relativePath, content] of Object.entries(files)) {
		const fullPath = join(baseDir, relativePath);
		await mkdir(join(fullPath, ".."), { recursive: true });
		await writeFile(fullPath, content, "utf-8");
	}
}

/** Minimal agent definition for testing. */
function makeDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "test-agent",
		description: "Test agent",
		capabilities: [],
		model: "anthropic/claude-sonnet-4-20250514",
		tools: "none",
		extensions: [],
		skills: ["*"],
		projectContext: true,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
}

/** Set up a minimal domains dir with base + persona prompts. */
async function setupMinimalDomains(
	baseDir: string,
	opts: { domain?: string; agentId?: string; capabilities?: string[] } = {},
): Promise<void> {
	const domain = opts.domain ?? "coding";
	const agentId = opts.agentId ?? "test-agent";
	const files: Record<string, string> = {
		"shared/prompts/base.md": "# Base Prompt\nYou are a helpful agent.",
		[`${domain}/prompts/${agentId}.md`]: `# ${agentId}\nYou are ${agentId}.`,
	};
	for (const cap of opts.capabilities ?? []) {
		files[`shared/capabilities/${cap}.md`] = `# ${cap}\n${cap} capability.`;
	}
	await setupFiles(baseDir, files);
}

async function setupSharedSkills(
	baseDir: string,
	skillNames: readonly string[],
): Promise<void> {
	await setupFiles(
		baseDir,
		Object.fromEntries(
			skillNames.map((skillName) => [
				`shared/skills/${skillName}/SKILL.md`,
				`---\nname: ${skillName}\ndescription: ${skillName}\n---`,
			]),
		),
	);
}

/** Build options with sensible defaults rooted at the temp dir. */
function makeOptions(
	overrides: Partial<BuildSessionParamsOptions> = {},
): BuildSessionParamsOptions {
	return {
		def: makeDef(),
		cwd: tmp.path,
		domainsDir: tmp.path,
		...overrides,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("buildSessionParams", () => {
	describe("prompt assembly and identity marker", () => {
		it("assembles base + persona and appends identity marker", async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());

			expect(params.promptContent).toContain("You are a helpful agent.");
			expect(params.promptContent).toContain("You are test-agent.");
			// Identity marker present
			const extractedId = extractAgentIdFromSystemPrompt(params.promptContent);
			// No domain set on def → unqualified ID
			expect(extractedId).toBe("test-agent");
		});

		it("includes capability layers in prompt", async () => {
			await setupMinimalDomains(tmp.path, {
				capabilities: ["core", "tasks"],
			});
			const def = makeDef({ capabilities: ["core", "tasks"] });
			const params = await buildSessionParams(makeOptions({ def }));

			expect(params.promptContent).toContain("core capability.");
			expect(params.promptContent).toContain("tasks capability.");
		});

		it("qualifies agent ID with domain in identity marker", async () => {
			await setupMinimalDomains(tmp.path, {
				domain: "testing",
				agentId: "runner",
			});
			const def = makeDef({ id: "runner", domain: "testing" });
			const params = await buildSessionParams(makeOptions({ def }));

			const extractedId = extractAgentIdFromSystemPrompt(params.promptContent);
			expect(extractedId).toBe("testing/runner");
		});
	});

	describe("tool resolution", () => {
		it('resolves "none" tool set to empty array', async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());
			expect(params.tools).toEqual([]);
		});

		it('resolves "coding" tool set to non-empty array', async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ tools: "coding" });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.tools.length).toBeGreaterThan(0);
		});

		it('resolves "readonly" tool set to non-empty array', async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ tools: "readonly" });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.tools.length).toBeGreaterThan(0);
		});
	});

	describe("extension paths", () => {
		it("returns empty array for agent with no extensions", async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());
			expect(params.extensionPaths).toEqual([]);
		});

		it("resolves extension names to absolute paths", async () => {
			await setupMinimalDomains(tmp.path);
			// Create a fake extension directory
			await mkdir(join(tmp.path, "shared", "extensions", "test-ext"), {
				recursive: true,
			});
			const def = makeDef({ extensions: ["test-ext"] });
			const params = await buildSessionParams(makeOptions({ def }));

			expect(params.extensionPaths).toHaveLength(1);
			expect(params.extensionPaths[0]).toContain("test-ext");
		});

		it("appends extraExtensionPaths after resolved extensions", async () => {
			await setupMinimalDomains(tmp.path);
			await mkdir(join(tmp.path, "shared", "extensions", "test-ext"), {
				recursive: true,
			});
			const def = makeDef({ extensions: ["test-ext"] });
			const extraPath = "/some/extra/extension";
			const params = await buildSessionParams(
				makeOptions({ def, extraExtensionPaths: [extraPath] }),
			);

			expect(params.extensionPaths).toHaveLength(2);
			expect(params.extensionPaths[0]).toContain("test-ext");
			expect(params.extensionPaths[1]).toBe(extraPath);
		});

		it("returns only extra paths when agent has no extensions", async () => {
			await setupMinimalDomains(tmp.path);
			const extraPath = "/agent-switch/ext";
			const params = await buildSessionParams(
				makeOptions({ extraExtensionPaths: [extraPath] }),
			);

			expect(params.extensionPaths).toEqual([extraPath]);
		});

		it("returns empty when no extensions and no extras", async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());
			expect(params.extensionPaths).toEqual([]);
		});
	});

	describe("skill overrides", () => {
		it("keeps wildcard agents unfiltered when projectSkills is absent", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ skills: ["*"] });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.skillsOverride).toBeUndefined();
		});

		it("returns filtering function when agent has explicit skills list", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ skills: ["typescript", "react"] });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.skillsOverride).toBeTypeOf("function");
		});

		it("preserves shared skills alongside project skills when filtering wildcard agents", async () => {
			await setupMinimalDomains(tmp.path);
			await setupSharedSkills(tmp.path, ["plan", "init"]);
			const params = await buildSessionParams(
				makeOptions({ projectSkills: ["typescript"] }),
			);

			expect(params.skillsOverride).toBeTypeOf("function");
			const result = params.skillsOverride?.({
				skills: [
					{ name: "plan" },
					{ name: "init" },
					{ name: "typescript" },
					{ name: "react" },
				] as never,
				diagnostics: [],
			});
			expect(result?.skills.map((skill) => skill.name)).toEqual([
				"plan",
				"init",
				"typescript",
			]);
		});

		it("ignores project skill filtering when requested for wildcard agents", async () => {
			await setupMinimalDomains(tmp.path);
			await setupSharedSkills(tmp.path, ["plan"]);
			const params = await buildSessionParams(
				makeOptions({
					projectSkills: ["typescript"],
					ignoreProjectSkills: true,
				}),
			);
			expect(params.skillsOverride).toBeUndefined();
		});

		it("returns empty skills when agent skills is empty array", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ skills: [] });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.skillsOverride).toBeTypeOf("function");
			const result = params.skillsOverride?.({
				skills: [{ name: "ts" } as never],
				diagnostics: [],
			});
			expect(result?.skills).toEqual([]);
		});
	});

	describe("additionalSkillPaths", () => {
		it("returns undefined when no skillPaths provided", async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());
			expect(params.additionalSkillPaths).toBeUndefined();
		});

		it("returns copy of skillPaths when provided", async () => {
			await setupMinimalDomains(tmp.path);
			const skillPaths = ["/path/to/skills"];
			const params = await buildSessionParams(makeOptions({ skillPaths }));
			expect(params.additionalSkillPaths).toEqual(["/path/to/skills"]);
		});
	});

	describe("model resolution", () => {
		it("resolves model from agent definition", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ model: "anthropic/claude-sonnet-4-20250514" });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.model).toBeDefined();
			expect(params.model.id).toBe("claude-sonnet-4-20250514");
		});

		it("uses modelOverride over definition model", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ model: "anthropic/claude-sonnet-4-20250514" });
			const params = await buildSessionParams(
				makeOptions({
					def,
					modelOverride: "anthropic/claude-opus-4-20250514",
				}),
			);
			expect(params.model.id).toBe("claude-opus-4-20250514");
		});

		it("falls back to FALLBACK_MODEL when no model specified", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ model: undefined as unknown as string });
			const params = await buildSessionParams(makeOptions({ def }));
			// FALLBACK_MODEL is "anthropic/claude-opus-4-7"
			expect(params.model).toBeDefined();
		});
	});

	describe("thinking level", () => {
		it("returns undefined when no thinking level set", async () => {
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());
			expect(params.thinkingLevel).toBeUndefined();
		});

		it("uses definition thinking level", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ thinkingLevel: "medium" });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.thinkingLevel).toBe("medium");
		});

		it("uses thinkingLevelOverride over definition", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ thinkingLevel: "low" });
			const params = await buildSessionParams(
				makeOptions({ def, thinkingLevelOverride: "high" }),
			);
			expect(params.thinkingLevel).toBe("high");
		});
	});

	describe("projectContext", () => {
		it("reflects agent definition projectContext", async () => {
			await setupMinimalDomains(tmp.path);

			const withContext = await buildSessionParams(
				makeOptions({ def: makeDef({ projectContext: true }) }),
			);
			expect(withContext.projectContext).toBe(true);

			const withoutContext = await buildSessionParams(
				makeOptions({ def: makeDef({ projectContext: false }) }),
			);
			expect(withoutContext.projectContext).toBe(false);
		});
	});
});
