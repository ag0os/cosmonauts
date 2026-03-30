import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DomainValidationError } from "../lib/domains/validator.ts";
import { CosmonautsRuntime } from "../lib/runtime.ts";
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
		workflows?: Array<{ name: string; description: string; chain: string }>;
	} = {},
): Promise<void> {
	const codingDir = join(domainsDir, "coding");
	await mkdir(codingDir, { recursive: true });

	const workflowsContent = opts.workflows
		? `export default ${JSON.stringify(opts.workflows)};`
		: "";
	if (workflowsContent) {
		await writeFile(join(codingDir, "workflows.ts"), workflowsContent);
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

	describe("workflow selection", () => {
		it("includes workflows from matching domain context", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				workflows: [
					{ name: "build", description: "Build all", chain: "worker" },
				],
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
				domainOverride: "coding",
			});

			expect(runtime.workflows).toHaveLength(1);
			expect(runtime.workflows[0]?.name).toBe("build");
		});

		it("includes all domain workflows when no domain context", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				workflows: [
					{ name: "build", description: "Build all", chain: "worker" },
				],
			});

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			// Without domain context, all workflows are included
			expect(runtime.workflows).toHaveLength(1);
			expect(runtime.workflows[0]?.name).toBe("build");
		});

		it("filters out non-matching domain workflows", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);
			await setupCodingDomain(domainsDir, [], {
				workflows: [
					{ name: "build", description: "Build all", chain: "worker" },
				],
			});

			// Create another domain with different workflows
			const otherDir = join(domainsDir, "other");
			await mkdir(otherDir, { recursive: true });
			await writeDomainManifest(otherDir, "other");
			await writeFile(
				join(otherDir, "workflows.ts"),
				`export default [{ name: "other-flow", description: "Other", chain: "x" }];`,
			);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
				domainOverride: "coding",
			});

			// Only shared + coding workflows, not "other"
			const names = runtime.workflows.map((w) => w.name);
			expect(names).toContain("build");
			expect(names).not.toContain("other-flow");
		});
	});

	describe("validation", () => {
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

			// Create domain with a workflow referencing unknown agents (warning-level)
			await setupCodingDomain(
				domainsDir,
				[{ id: "planner", capabilities: ["core"] }],
				{
					workflows: [
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

		it("produces empty workflows", async () => {
			const domainsDir = join(tmp.path, "domains");
			await mkdir(domainsDir, { recursive: true });
			await setupSharedDomain(domainsDir);

			const runtime = await CosmonautsRuntime.create({
				builtinDomainsDir: domainsDir,
				projectRoot: tmp.path,
			});

			expect(runtime.workflows).toHaveLength(0);
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
					workflows: [{ name: "build", description: "Build", chain: "worker" }],
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
			expect(runtime.workflows).toHaveLength(1);
			expect(runtime.workflows[0]?.name).toBe("build");
			expect(runtime.domainsDir).toBe(domainsDir);
			expect(Object.isFrozen(runtime)).toBe(true);
		});
	});
});
