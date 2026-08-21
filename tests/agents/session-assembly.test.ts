/**
 * Tests for the shared session parameter builder (buildSessionParams).
 *
 * Verifies prompt assembly, identity marker, tool resolution, extension paths,
 * skill overrides, model resolution, thinking level, and extraExtensionPaths.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
	buildAgentIdentityMarker,
	extractAgentIdFromSystemPrompt,
} from "../../lib/agents/runtime-identity.ts";
import {
	type BuildSessionParamsOptions,
	buildSessionParams,
} from "../../lib/agents/session-assembly.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import { loadDomainsFromSources } from "../../lib/domains/loader.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

// Model resolution falls through to Pi's real built-in model catalog, whose
// contents change across Pi version bumps. Stub it so these tests assert on
// resolution logic (definition/override/fallback) without depending on any
// specific model ID surviving upstream catalog changes.
vi.mock("@earendil-works/pi-ai/providers/all", () => ({
	builtinModels: () => ({
		getModel: (provider: string, id: string) => ({ provider, id }),
	}),
}));

const tmp = useTempDir("session-assembly-");
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const REPO_DOMAINS_DIR = join(REPO_ROOT, "domains");

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
		model: "anthropic/test-sonnet",
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
	const domain = opts.domain ?? "main";
	const agentId = opts.agentId ?? "test-agent";
	const files: Record<string, string> = {
		"framework/base.md": "# Base Prompt\nYou are a helpful agent.",
		[`${domain}/prompts/${agentId}.md`]: `# ${agentId}\nYou are ${agentId}.`,
	};
	for (const cap of opts.capabilities ?? []) {
		files[`shared/capabilities/${cap}.md`] = `# ${cap}\n${cap} capability.`;
	}
	await setupFiles(baseDir, files);
}

function makeDomain(
	id: string,
	overrides: Partial<LoadedDomain> = {},
): LoadedDomain {
	const rootDir = join(tmp.path, id);
	return {
		manifest: { id, description: `Domain ${id}` },
		portable: false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		chains: [],
		provenance: [
			{ origin: tmp.path, precedence: 0, kind: "domains-dir", rootDir },
		],
		rootDirs: [rootDir],
		...overrides,
	};
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
		frameworkPromptsDir: join(tmp.path, "framework"),
		...overrides,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("buildSessionParams", () => {
	describe("prompt assembly and identity marker", () => {
		it("loads main prompt resources for domainless definitions without a coding directory", async () => {
			// @cosmo-behavior plan:coding-agnostic-framework#B-003
			await setupMinimalDomains(tmp.path);
			const params = await buildSessionParams(makeOptions());

			expect(params.promptContent).toContain("You are a helpful agent.");
			expect(params.promptContent).toContain("You are test-agent.");
		});

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
		it("keeps OFF assembly byte-for-byte and composes one enabled inline surface", async () => {
			await setupMinimalDomains(tmp.path);
			for (const name of ["agent-memory", "architecture-memory", "unrelated"]) {
				await mkdir(join(tmp.path, "shared", "extensions", name), {
					recursive: true,
				});
			}
			const def = makeDef({
				domain: "main",
				extensions: ["agent-memory", "architecture-memory", "unrelated"],
			});
			const off = await buildSessionParams(
				makeOptions({ def, loadConfig: async () => ({}) }),
			);
			const on = await buildSessionParams(
				makeOptions({
					def,
					loadConfig: async () => ({
						knowledgeSurface: { enabled: true },
					}),
				}),
			);

			expect(off.knowledgeSurfaceEnabled).toBe(false);
			expect(off.extensionFactories).toEqual([]);
			expect(off.extensionPaths).toEqual([
				join(tmp.path, "shared", "extensions", "agent-memory"),
				join(tmp.path, "shared", "extensions", "architecture-memory"),
				join(tmp.path, "shared", "extensions", "unrelated"),
			]);
			expect(on.knowledgeSurfaceEnabled).toBe(true);
			expect(on.extensionFactories).toHaveLength(1);
			expect(on.extensionFactories[0]).toMatchObject({
				name: "cosmonauts-knowledge-surface",
			});
			expect(on.extensionPaths).toEqual([
				join(tmp.path, "shared", "extensions", "unrelated"),
			]);
		});

		it("reassembles both gate edits into a fresh factory selection", async () => {
			await setupMinimalDomains(tmp.path);
			let enabled = false;
			const options = makeOptions({
				loadConfig: async () => ({ knowledgeSurface: { enabled } }),
			});

			const initiallyOff = await buildSessionParams(options);
			enabled = true;
			expect(initiallyOff.extensionFactories).toEqual([]);
			expect(initiallyOff.knowledgeSurfaceEnabled).toBe(false);

			const switchedOn = await buildSessionParams(options);
			enabled = false;
			expect(switchedOn.extensionFactories).toHaveLength(1);
			expect(switchedOn.knowledgeSurfaceEnabled).toBe(true);

			const switchedOff = await buildSessionParams(options);
			expect(switchedOff.extensionFactories).toEqual([]);
			expect(switchedOff.knowledgeSurfaceEnabled).toBe(false);
		});

		it("keeps exact-wrapper tools registered without widening synthetic authorization", async () => {
			await setupMinimalDomains(tmp.path, { agentId: "synthetic" });
			for (const name of ["agent-memory", "architecture-memory"]) {
				await mkdir(join(tmp.path, "shared", "extensions", name), {
					recursive: true,
				});
			}
			const def = makeDef({
				id: "synthetic",
				domain: "main",
				extensions: ["agent-memory", "architecture-memory"],
			});
			const params = await buildSessionParams(
				makeOptions({
					def,
					loadConfig: async () => ({
						knowledgeSurface: { enabled: true },
					}),
				}),
			);
			const inline = params.extensionFactories[0];
			if (!inline || typeof inline === "function") {
				throw new Error("Expected a named inline knowledge extension");
			}
			const pi = createMockPi({ cwd: tmp.path });
			await inline.factory(pi as never);

			expect([...pi.tools.keys()].sort()).toEqual([
				"architecture_map_read",
				"recall",
				"remember",
			]);
			const before = await pi.fireEvent(
				"before_agent_start",
				{ systemPrompt: buildAgentIdentityMarker("main/synthetic") },
				{ cwd: tmp.path },
			);
			expect(before).toBeUndefined();
			expect(
				(
					(await pi.callTool("remember", { content: "no" })) as {
						details: unknown;
					}
				).details,
			).toMatchObject({ status: "unauthorized" });
			expect(
				(
					(await pi.callTool("architecture_map_read", {})) as {
						details: unknown;
					}
				).details,
			).toMatchObject({ status: "scope-ineligible" });
			expect(
				(
					(await pi.callTool("recall", { query: "surface" })) as {
						details: unknown;
					}
				).details,
			).toMatchObject({ status: "no_match", records: [] });
		});

		it("composes exactly one framework recall for every shipped definition", async () => {
			const loadedDomains = await loadDomainsFromSources([
				{
					domainsDir: REPO_DOMAINS_DIR,
					origin: "builtin",
					precedence: 1,
				},
				{
					domainsDir: join(REPO_ROOT, "bundled", "coding"),
					sourceType: "domain-root",
					origin: "bundled",
					precedence: 2,
				},
			]);
			const resolver = new DomainResolver(new DomainRegistry(loadedDomains));
			const definitions = loadedDomains.flatMap((domain) =>
				[...domain.agents.values()].map((definition) => ({
					...definition,
					domain: domain.manifest.id,
				})),
			);

			for (const def of definitions) {
				const params = await buildSessionParams({
					def,
					cwd: tmp.path,
					domainsDir: REPO_DOMAINS_DIR,
					resolver,
					loadConfig: async () => ({
						knowledgeSurface: { enabled: true },
					}),
				});
				const inline = params.extensionFactories[0];
				if (!inline || typeof inline === "function") {
					throw new Error(`Expected named inline extension for ${def.id}`);
				}
				const pi = createMockPi({ cwd: tmp.path });
				pi.registerTool({
					name: "unrelated",
					execute: async () => ({ content: [], details: { status: "ok" } }),
				});
				await inline.factory(pi as never);

				expect(
					[...pi.tools.keys()].filter((name) => name === "recall"),
					def.id,
				).toHaveLength(1);
				expect(pi.tools.has("unrelated"), def.id).toBe(true);
				expect(
					((await pi.callTool("unrelated", {})) as { details: unknown })
						.details,
				).toEqual({ status: "ok" });
			}
		});

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

		it("prefers main extension paths for domainless definitions", async () => {
			// @cosmo-behavior plan:coding-agnostic-framework#B-004
			await setupMinimalDomains(tmp.path);
			await mkdir(join(tmp.path, "main", "extensions", "test-ext"), {
				recursive: true,
			});
			await mkdir(join(tmp.path, "shared", "extensions", "test-ext"), {
				recursive: true,
			});
			const def = makeDef({ extensions: ["test-ext"] });
			const params = await buildSessionParams(makeOptions({ def }));

			expect(params.extensionPaths).toEqual([
				join(tmp.path, "main", "extensions", "test-ext"),
			]);
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

		it("uses main as the requester domain for domainless skill visibility", async () => {
			// @cosmo-behavior plan:coding-agnostic-framework#B-005
			await setupMinimalDomains(tmp.path);
			const resolver = new DomainResolver(
				new DomainRegistry([
					makeDomain("main", {
						prompts: new Set(["test-agent"]),
					}),
					makeDomain("ruby-coding", {
						manifest: {
							id: "ruby-coding",
							description: "Ruby coding",
							internal: { skills: ["internal-skill"] },
						},
						skills: new Set(["public-skill", "internal-skill"]),
					}),
				]),
			);
			const params = await buildSessionParams(
				makeOptions({ resolver, domainsDir: undefined }),
			);

			expect(params.skillsOverride).toBeTypeOf("function");
			const result = params.skillsOverride?.({
				skills: [
					{ name: "main-skill" },
					{ name: "public-skill" },
					{ name: "internal-skill" },
				] as never,
				diagnostics: [],
			});

			expect(result?.skills.map((skill) => skill.name)).toEqual([
				"main-skill",
				"public-skill",
			]);
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
			const def = makeDef({ model: "anthropic/test-sonnet" });
			const params = await buildSessionParams(makeOptions({ def }));
			expect(params.model).toBeDefined();
			expect(params.model.id).toBe("test-sonnet");
		});

		it("uses modelOverride over definition model", async () => {
			await setupMinimalDomains(tmp.path);
			const def = makeDef({ model: "anthropic/test-sonnet" });
			const params = await buildSessionParams(
				makeOptions({
					def,
					modelOverride: "anthropic/test-opus",
				}),
			);
			expect(params.model.id).toBe("test-opus");
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
