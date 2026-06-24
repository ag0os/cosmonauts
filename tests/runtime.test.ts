import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { isSubagentAllowed } from "../domains/shared/extensions/orchestration/authorization.ts";
import { resolveDefaultLead } from "../lib/agents/resolve-default-lead.ts";
import { DomainValidationError } from "../lib/domains/validator.ts";
import { parseChain } from "../lib/orchestration/chain-parser.ts";
import { compileChainToGraph } from "../lib/orchestration/durable-chain-compiler.ts";
import { CosmonautsRuntime, DomainBindingTargetError } from "../lib/runtime.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("runtime-test-");

// ============================================================================
// Helpers
// ============================================================================

/** Write a minimal domain.ts manifest file. */
async function writeDomainManifest(
	dir: string,
	id: string,
	extras = "",
): Promise<void> {
	await writeFile(
		join(dir, "domain.ts"),
		`export const manifest = { id: "${id}", description: "Test domain ${id}" ${extras} };\n`,
	);
}

/** Write a minimal agent definition file. */
async function writeAgentDef(
	agentsDir: string,
	id: string,
	overrides: Record<string, unknown> = {},
): Promise<void> {
	const merged = {
		id,
		description: `Agent ${id}`,
		capabilities: [],
		model: "test/model",
		tools: "none",
		extensions: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		...overrides,
	};
	await writeFile(
		join(agentsDir, `${id}.ts`),
		`const definition = ${JSON.stringify(merged)};\nexport default definition;\n`,
	);
}

/** Write a project config .cosmonauts/config.json */
async function writeProjectConfig(
	projectRoot: string,
	config: Record<string, unknown>,
): Promise<void> {
	const configDir = join(projectRoot, ".cosmonauts");
	await mkdir(configDir, { recursive: true });
	await writeFile(join(configDir, "config.json"), JSON.stringify(config));
}

/** Create a valid shared domain with capabilities/extensions/prompts. */
async function setupSharedDomain(
	domainsDir: string,
	opts: { capabilities?: string[]; extensions?: string[] } = {},
): Promise<void> {
	const sharedDir = join(domainsDir, "shared");
	await mkdir(sharedDir, { recursive: true });
	await writeDomainManifest(sharedDir, "shared");

	// capabilities
	const capsDir = join(sharedDir, "capabilities");
	await mkdir(capsDir, { recursive: true });
	for (const cap of opts.capabilities ?? []) {
		await writeFile(join(capsDir, `${cap}.md`), `# ${cap}`);
	}

	// extensions
	for (const ext of opts.extensions ?? []) {
		const extDir = join(sharedDir, "extensions", ext);
		await mkdir(extDir, { recursive: true });
		await writeFile(join(extDir, "index.ts"), "export default function() {}");
	}
}

/** Create a coding domain with agents and prompts. */
async function setupCodingDomain(
	domainsDir: string,
	agents: Array<{ id: string; capabilities?: string[]; extensions?: string[] }>,
	opts: {
		chains?: Array<{ name: string; description: string; chain: string }>;
	} = {},
): Promise<void> {
	const codingDir = join(domainsDir, "coding");
	await mkdir(codingDir, { recursive: true });

	const workflowsContent = opts.chains
		? `export default ${JSON.stringify(opts.chains)};`
		: "";
	if (workflowsContent) {
		await writeFile(join(codingDir, "chains.ts"), workflowsContent);
	}

	await writeDomainManifest(codingDir, "coding");

	const agentsDir = join(codingDir, "agents");
	await mkdir(agentsDir, { recursive: true });

	const promptsDir = join(codingDir, "prompts");
	await mkdir(promptsDir, { recursive: true });

	for (const agent of agents) {
		await writeAgentDef(agentsDir, agent.id, {
			capabilities: agent.capabilities ?? [],
			extensions: agent.extensions ?? [],
		});
		await writeFile(join(promptsDir, `${agent.id}.md`), `# ${agent.id}`);
	}
}

/** Create a named test domain with matching agent persona prompts. */
async function setupNamedDomain(
	domainsDir: string,
	id: string,
	agents: Array<{ id: string; overrides?: Record<string, unknown> }>,
	opts: {
		lead?: string;
		chains?: Array<{ name: string; description: string; chain: string }>;
	} = {},
): Promise<void> {
	const domainDir = join(domainsDir, id);
	await mkdir(domainDir, { recursive: true });
	await writeDomainManifest(
		domainDir,
		id,
		opts.lead ? `, lead: "${opts.lead}"` : "",
	);
	if (opts.chains) {
		await writeFile(
			join(domainDir, "chains.ts"),
			`export default ${JSON.stringify(opts.chains)};`,
		);
	}

	const agentsDir = join(domainDir, "agents");
	const promptsDir = join(domainDir, "prompts");
	await mkdir(agentsDir, { recursive: true });
	await mkdir(promptsDir, { recursive: true });

	for (const agent of agents) {
		await writeAgentDef(agentsDir, agent.id, agent.overrides);
		await writeFile(join(promptsDir, `${agent.id}.md`), `# ${agent.id}`);
	}
}

// ============================================================================
// Tests
// ============================================================================

describe("CosmonautsRuntime", () => {
	describe("create()", () => {
		it("loads config, domains, and builds registries", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			await setupCodingDomain(domainsDir, [
				{ id: "worker", capabilities: ["core"] },
			]);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.projectConfig).toBeDefined();
			expect(runtime.domains).toHaveLength(2);
			expect(runtime.domainRegistry).toBeDefined();
			expect(runtime.agentRegistry).toBeDefined();
			expect(runtime.domainsDir).toBe(domainsDir);
		});

		it("exposes projectSkills from config", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await writeProjectConfig(tmp.path, { skills: ["typescript", "react"] });

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.projectSkills).toEqual(["typescript", "react"]);
		});

		it("returns undefined projectSkills when config has no skills", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.projectSkills).toBeUndefined();
		});

		it("builds agent registry from loaded domains", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			await setupCodingDomain(domainsDir, [
				{ id: "worker", capabilities: ["core"] },
				{ id: "planner", capabilities: ["core"] },
			]);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.agentRegistry.has("worker")).toBe(true);
			expect(runtime.agentRegistry.has("planner")).toBe(true);
		});

		it("builds domain registry from loaded domains", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, []);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.domainRegistry.has("shared")).toBe(true);
			expect(runtime.domainRegistry.has("coding")).toBe(true);
			expect(runtime.domainRegistry.has("nonexistent")).toBe(false);
		});
	});

	describe("immutability", () => {
		it("returns a frozen object", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(Object.isFrozen(runtime)).toBe(true);
		});

		it("rejects property assignment on frozen runtime", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(() => {
				(runtime as unknown as Record<string, unknown>).domainContext =
					"hacked";
			}).toThrow();
		});
	});

	describe("domain context resolution", () => {
		it("uses domainOverride when provided", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await writeProjectConfig(tmp.path, { domain: "from-config" });

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
				domainOverride: "from-override",
			});

			expect(runtime.domainContext).toBe("from-override");
		});

		it("falls back to project config domain when no override", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await writeProjectConfig(tmp.path, { domain: "from-config" });

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.domainContext).toBe("from-config");
		});

		it("returns undefined when neither override nor config is set", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.domainContext).toBeUndefined();
		});
	});

	describe("chain selection", () => {
		it("includes chains from matching domain context", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				chains: [{ name: "build", description: "Build all", chain: "worker" }],
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
				domainOverride: "coding",
			});

			expect(runtime.chains).toHaveLength(1);
			expect(runtime.chains[0]?.name).toBe("build");
		});

		it("includes all domain chains when no domain context", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				chains: [{ name: "build", description: "Build all", chain: "worker" }],
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			// Without domain context, all chains are included
			expect(runtime.chains).toHaveLength(1);
			expect(runtime.chains[0]?.name).toBe("build");
		});

		it("filters out non-matching domain chains", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				chains: [{ name: "build", description: "Build all", chain: "worker" }],
			});

			// Create another domain with different chains
			const otherDir = join(domainsDir, "other");
			await mkdir(otherDir, { recursive: true });
			await writeDomainManifest(otherDir, "other");
			await writeFile(
				join(otherDir, "chains.ts"),
				`export default [{ name: "other-flow", description: "Other", chain: "x" }];`,
			);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
				domainOverride: "coding",
			});

			// Only shared + coding chains, not "other"
			const names = runtime.chains.map((w) => w.name);
			expect(names).toContain("build");
			expect(names).not.toContain("other-flow");
		});
	});

	describe("validation", () => {
		it("filters inactive domains before validation and same-precedence conflict checks", async () => {
			// @cosmo-behavior plan:domain-authoring#B-017
			const projectRoot = join(tmp.path, "project");
			const domainsDir = join(tmp.path, "domains");
			await mkdir(projectRoot, { recursive: true });
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });

			const alphaDir = join(domainsDir, "alpha");
			await mkdir(alphaDir, { recursive: true });
			await writeDomainManifest(alphaDir, "alpha");

			const betaDir = join(domainsDir, "beta");
			const betaAgentsDir = join(betaDir, "agents");
			await mkdir(betaAgentsDir, { recursive: true });
			await writeDomainManifest(betaDir, "beta");
			await writeAgentDef(betaAgentsDir, "broken", {
				capabilities: ["missing-capability"],
			});

			const pluginA = join(tmp.path, "plugin-a");
			const pluginB = join(tmp.path, "plugin-b");
			const gammaA = join(pluginA, "gamma-a");
			const gammaB = join(pluginB, "gamma-b");
			await mkdir(gammaA, { recursive: true });
			await mkdir(gammaB, { recursive: true });
			await writeDomainManifest(gammaA, "gamma");
			await writeDomainManifest(gammaB, "gamma");

			await writeProjectConfig(projectRoot, { activeDomains: ["alpha"] });

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot,
				pluginDirs: [pluginA, pluginB],
			});

			expect(runtime.domains.map((domain) => domain.manifest.id)).toEqual([
				"shared",
				"alpha",
			]);
			expect(
				runtime.domains.find((domain) => domain.manifest.id === "alpha")
					?.provenance[0]?.origin,
			).toBe("builtin");

			await writeProjectConfig(projectRoot, {
				activeDomains: ["alpha"],
				domainBindings: { alpha: "beta" },
			});

			// @cosmo-behavior plan:domain-authoring#B-009
			await expect(
				CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot,
					pluginDirs: [pluginA, pluginB],
				}),
			).rejects.toMatchObject({
				name: "DomainBindingTargetError",
				role: "alpha",
				targetDomain: "beta",
			});
			await expect(
				CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot,
					pluginDirs: [pluginA, pluginB],
				}),
			).rejects.toThrow(/alpha.*beta|beta.*alpha/);
			expect(DomainBindingTargetError).toBeDefined();
		});

		it("throws DomainValidationError on error-severity diagnostics", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			// Create a coding domain with an agent that references a missing capability
			const codingDir = join(domainsDir, "coding");
			await mkdir(codingDir, { recursive: true });
			await writeDomainManifest(codingDir, "coding");

			const agentsDir = join(codingDir, "agents");
			await mkdir(agentsDir, { recursive: true });
			await writeAgentDef(agentsDir, "bad-agent", {
				capabilities: ["nonexistent-cap"],
			});

			// Add persona prompt so the only error is the capability
			const promptsDir = join(codingDir, "prompts");
			await mkdir(promptsDir, { recursive: true });
			await writeFile(join(promptsDir, "bad-agent.md"), "# bad-agent");

			await expect(
				CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				}),
			).rejects.toThrow(DomainValidationError);
		});

		it("aggregates multiple error diagnostics into thrown error", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const codingDir = join(domainsDir, "coding");
			await mkdir(codingDir, { recursive: true });
			await writeDomainManifest(codingDir, "coding");

			const agentsDir = join(codingDir, "agents");
			await mkdir(agentsDir, { recursive: true });
			// Agent with missing capability AND missing persona prompt
			await writeAgentDef(agentsDir, "broken", {
				capabilities: ["missing-cap"],
				extensions: ["missing-ext"],
			});

			try {
				await CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				});
				expect.unreachable("Should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(DomainValidationError);
				const validationError = err as DomainValidationError;
				// Should have multiple errors: missing prompt, missing cap, missing ext
				expect(validationError.diagnostics.length).toBeGreaterThanOrEqual(3);
			}
		});

		it("emits warnings to stderr without throwing", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });

			// Create domain with a chain referencing unknown agents (warning-level)
			await setupCodingDomain(
				domainsDir,
				[{ id: "planner", capabilities: ["core"] }],
				{
					chains: [
						{
							name: "test-wf",
							description: "Test",
							chain: "planner -> ghost-agent",
						},
					],
				},
			);

			const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				const runtime = await CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				});

				// Should not throw — warnings don't halt startup
				expect(runtime).toBeDefined();

				// Should have logged warning to stderr
				expect(stderrSpy).toHaveBeenCalled();
				const warningCall = stderrSpy.mock.calls.find(
					(call) =>
						typeof call[0] === "string" && call[0].includes("ghost-agent"),
				);
				expect(warningCall).toBeDefined();
			} finally {
				stderrSpy.mockRestore();
			}
		});

		it("does not throw when only warnings are present", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });

			// Agent with subagent that doesn't resolve (warning-only)
			const codingDir = join(domainsDir, "coding");
			await mkdir(codingDir, { recursive: true });
			await writeDomainManifest(codingDir, "coding");

			const agentsDir = join(codingDir, "agents");
			await mkdir(agentsDir, { recursive: true });
			await writeAgentDef(agentsDir, "leader", {
				capabilities: ["core"],
				subagents: ["nonexistent-sub"],
			});

			const promptsDir = join(codingDir, "prompts");
			await mkdir(promptsDir, { recursive: true });
			await writeFile(join(promptsDir, "leader.md"), "# leader");

			const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				const runtime = await CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				});
				expect(runtime).toBeDefined();
			} finally {
				stderrSpy.mockRestore();
			}
		});
	});

	describe("domain bindings", () => {
		it("applies project domain bindings when resolving qualified agent references", async () => {
			// @cosmo-behavior plan:domain-authoring#B-008
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			await setupNamedDomain(domainsDir, "ruby-coding", [
				{
					id: "worker",
					overrides: {
						description: "Original worker",
						capabilities: ["core"],
					},
				},
			]);
			await setupNamedDomain(domainsDir, "ruby-experimental", [
				{
					id: "worker",
					overrides: {
						description: "Experimental worker",
						capabilities: ["core"],
					},
				},
			]);
			await setupNamedDomain(domainsDir, "consumer", [
				{
					id: "leader",
					overrides: {
						capabilities: ["core"],
						subagents: ["ruby-coding/worker"],
					},
				},
			]);
			await writeProjectConfig(tmp.path, {
				activeDomains: ["ruby-coding", "ruby-experimental", "consumer"],
				domainBindings: { "ruby-coding": "ruby-experimental" },
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			const target =
				runtime.agentRegistry.resolveReference("ruby-coding/worker");
			expect(target?.definition.domain).toBe("ruby-experimental");
			expect(target?.definition.description).toBe("Experimental worker");
			expect(target?.reference).toEqual({
				requested: {
					role: "ruby-coding",
					agentId: "worker",
					qualifiedId: "ruby-coding/worker",
				},
				resolved: {
					role: "ruby-experimental",
					agentId: "worker",
					qualifiedId: "ruby-experimental/worker",
				},
				binding: {
					role: "ruby-coding",
					domainId: "ruby-experimental",
					source: "project",
				},
			});

			const consumer = runtime.agentRegistry.resolve("consumer/leader");
			if (!target) {
				expect.unreachable("Expected ruby-coding/worker to resolve");
			}
			expect(
				isSubagentAllowed(consumer, target.definition, target.reference),
			).toBe(true);

			const unbound = runtime.agentRegistry.resolveReference(
				"ruby-experimental/worker",
			);
			expect(unbound?.definition.domain).toBe("ruby-experimental");
			expect(unbound?.reference.requested.qualifiedId).toBe(
				"ruby-experimental/worker",
			);
			expect(unbound?.reference.resolved.qualifiedId).toBe(
				"ruby-experimental/worker",
			);
			expect(unbound?.reference.binding.source).toBe("default");
		});

		it("treats default domain config as a bindable role across leads, chains, orchestration, and per-role settings", async () => {
			// @cosmo-behavior plan:domain-authoring#B-023
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			await setupNamedDomain(
				domainsDir,
				"coding",
				[
					{
						id: "placeholder",
						overrides: {
							capabilities: ["core"],
						},
					},
				],
				{ lead: "placeholder" },
			);
			await setupNamedDomain(
				domainsDir,
				"ruby-coding",
				[
					{
						id: "cody",
						overrides: {
							capabilities: ["core"],
							model: "test/ruby-cody",
						},
					},
					{
						id: "worker",
						overrides: {
							capabilities: ["core"],
							model: "test/ruby-worker",
							thinkingLevel: "high",
						},
					},
				],
				{
					lead: "cody",
					chains: [
						{
							name: "ruby-build",
							description: "Ruby build",
							chain: "worker",
						},
					],
				},
			);
			await setupNamedDomain(domainsDir, "consumer", [
				{
					id: "leader",
					overrides: {
						capabilities: ["core"],
						subagents: ["coding/worker"],
					},
				},
			]);
			await setupNamedDomain(domainsDir, "other", [], {
				chains: [
					{ name: "other-build", description: "Other", chain: "worker" },
				],
			});
			await writeProjectConfig(tmp.path, {
				activeDomains: ["coding", "ruby-coding", "consumer", "other"],
				domain: "coding",
				domainBindings: { coding: "ruby-coding" },
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.domainContext).toBe("coding");
			expect(runtime.chains.map((chain) => chain.name)).toEqual(["ruby-build"]);
			expect(resolveDefaultLead(runtime, {}).domain).toBe("ruby-coding");
			expect(resolveDefaultLead(runtime, {}).id).toBe("cody");

			// --list-agents must resolve the bound default-domain role to its target
			// so inspection shows the agents lead/spawning/chains actually use, not
			// the unbound "coding" placeholder. Mirrors cli handleListAgents (P3).
			const listedDomain =
				runtime.bindingResolver.resolveKnownRole(runtime.domainContext ?? "")
					?.domainId ?? runtime.domainContext;
			expect(listedDomain).toBe("ruby-coding");
			const listedIds = runtime.agentRegistry
				.resolveInDomain(listedDomain as string)
				.map((agent) => agent.id);
			expect(listedIds).toEqual(expect.arrayContaining(["cody", "worker"]));
			expect(listedIds).not.toContain("placeholder");

			const steps = parseChain(
				"worker",
				runtime.agentRegistry,
				runtime.domainContext,
			);
			expect(steps).toHaveLength(1);
			const stage = steps[0];
			if (!stage || "kind" in stage) {
				expect.unreachable("Expected one chain stage");
			}
			expect(stage.name).toBe("worker");
			expect(stage.agentReference).toEqual({
				requested: {
					role: "coding",
					agentId: "worker",
					qualifiedId: "coding/worker",
				},
				resolved: {
					role: "ruby-coding",
					agentId: "worker",
					qualifiedId: "ruby-coding/worker",
				},
				binding: {
					role: "coding",
					domainId: "ruby-coding",
					source: "project",
				},
			});

			const compiled = compileChainToGraph({
				runId: "chain-binding-test",
				steps,
				projectRoot: tmp.path,
				registry: runtime.agentRegistry,
				domainContext: runtime.domainContext,
			});
			const backendOptions = compiled.graph.steps[0]?.backend.options as
				| {
						stage: {
							name: string;
							agentReference?: typeof stage.agentReference;
						};
						spawn: {
							role: string;
							agentReference?: typeof stage.agentReference;
							domainContext?: string;
							model: string;
							thinkingLevel?: string;
						};
				  }
				| undefined;

			expect(backendOptions?.stage.name).toBe("worker");
			expect(backendOptions?.stage.agentReference).toEqual(
				stage.agentReference,
			);
			expect(backendOptions?.spawn.role).toBe("worker");
			expect(backendOptions?.spawn.agentReference).toEqual(
				stage.agentReference,
			);
			expect(backendOptions?.spawn.domainContext).toBe("coding");
			expect(backendOptions?.spawn.model).toBe("test/ruby-worker");
			expect(backendOptions?.spawn.thinkingLevel).toBe("high");

			const consumer = runtime.agentRegistry.resolve("consumer/leader");
			const target = runtime.agentRegistry.resolveReference(
				"worker",
				runtime.domainContext,
			);
			if (!target) {
				expect.unreachable("Expected worker to resolve through binding");
			}
			expect(
				isSubagentAllowed(consumer, target.definition, target.reference),
			).toBe(true);
		});
	});

	describe("no installed domains (only shared)", () => {
		it("succeeds when only the shared domain is present", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			// No coding domain or any other non-shared domain installed.

			await expect(
				CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				}),
			).resolves.toBeDefined();
		});

		it("exposes only the shared domain in the registry", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.domains).toHaveLength(1);
			expect(runtime.domains[0]?.manifest.id).toBe("shared");
			expect(runtime.domainRegistry.has("shared")).toBe(true);
		});

		it("produces an empty agent registry", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.agentRegistry.listAll()).toHaveLength(0);
		});

		it("produces empty chains", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.chains).toHaveLength(0);
		});

		it("validator does not produce error diagnostics for shared-only config", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });

			// DomainValidationError is only thrown on error-severity diagnostics;
			// if this resolves, the validator passed the shared-only domain list cleanly.
			const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			try {
				const runtime = await CosmonautsRuntime.create({
					builtinDomainsDir: domainsDir,
					projectRoot: tmp.path,
				});
				expect(runtime).toBeDefined();
				// No warnings either for a clean shared-only setup.
				expect(stderrSpy).not.toHaveBeenCalled();
			} finally {
				stderrSpy.mockRestore();
			}
		});
	});

	describe("full bootstrap integration", () => {
		it("produces a complete runtime with all fields populated", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir, { capabilities: ["core"] });
			await setupCodingDomain(
				domainsDir,
				[{ id: "worker", capabilities: ["core"] }],
				{
					chains: [{ name: "build", description: "Build", chain: "worker" }],
				},
			);
			await writeProjectConfig(tmp.path, {
				domain: "coding",
				skills: ["typescript"],
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.projectConfig.domain).toBe("coding");
			expect(runtime.projectSkills).toEqual(["typescript"]);
			expect(runtime.domains).toHaveLength(2);
			expect(runtime.domainContext).toBe("coding");
			expect(runtime.domainRegistry.has("shared")).toBe(true);
			expect(runtime.domainRegistry.has("coding")).toBe(true);
			expect(runtime.agentRegistry.has("worker")).toBe(true);
			expect(runtime.chains).toHaveLength(1);
			expect(runtime.chains[0]?.name).toBe("build");
			expect(runtime.domainsDir).toBe(domainsDir);
			expect(Object.isFrozen(runtime)).toBe(true);
		});
	});
});
