import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { AgentRegistry } from "../lib/agents/resolver.ts";
import type { AgentDefinition } from "../lib/agents/types.ts";
import type { LoadedDomain } from "../lib/domains/types.ts";
import { normalizeChain } from "../lib/orchestration/chain-normalization.ts";
import { selectChain } from "../lib/orchestration/chain-selection.ts";
import {
	CosmonautsRuntime,
	RuntimeDeclarationCollisionError,
} from "../lib/runtime.ts";
import { useTempDir } from "./helpers/fs.ts";

const tmp = useTempDir("consumer-runtime-");
function actor(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
	return {
		id: "scribe",
		domain: "studio",
		description: "Consumer writer",
		instructions: { kind: "inline", content: "Write" },
		model: "test/model",
		tools: "none",
		capabilities: [],
		extensions: [],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
		memory: { authored: true },
		...overrides,
	};
}
function domain(id: string, alwaysActive = false): LoadedDomain {
	return {
		manifest: { id, description: id, alwaysActive },
		agents: new Map(),
		portable: false,
		capabilities: new Set(),
		prompts: new Set(),
		skills: new Set(),
		extensions: new Set(),
		chains: [],
		provenance: [],
		rootDirs: [],
	};
}

test("a runtime needs no framework directories to resolve a qualified agent, chain and memory grant", async () => {
	const definition = actor();
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		agents: [definition],
		chains: [
			{
				name: "publish",
				description: "Consumer chain",
				stages: [{ name: "studio/scribe" }],
			},
		],
		projectConfig: {},
	});
	expect(runtime.domainsDir).toBeUndefined();
	expect(runtime.domains).toEqual([]);
	expect(runtime.agentRegistry.resolve("studio/scribe")).toBe(definition);
	expect(runtime.agentRegistry.resolve("scribe", "studio").memory).toEqual({
		authored: true,
	});
	const normalized = normalizeChain({
		projectRoot: tmp.path,
		registry: runtime.agentRegistry,
		steps: selectChain("publish", runtime.chains).steps,
	});
	expect(normalized.ok).toBe(true);
	if (normalized.ok)
		expect(normalized.stages[0]).toMatchObject({
			declarationId: "studio/scribe",
		});
});

test("pre-qualified declarations normalize identity and collide with their equivalent domain/id declaration", async () => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		agents: [actor({ id: "studio/scribe", domain: undefined })],
	});
	expect(runtime.agentRegistry.resolve("studio/scribe")).toMatchObject({
		id: "scribe",
		domain: "studio",
	});
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			agents: [actor(), actor({ id: "studio/scribe", domain: undefined })],
		}),
	).rejects.toMatchObject({
		name: "RuntimeDeclarationCollisionError",
		kind: "agent",
		id: "studio/scribe",
	});
});

test("runtime collision rejection leaves the layering registry's overwrite contract intact", async () => {
	const first = actor();
	const second = actor({ description: "Later" });
	const registry = new AgentRegistry([first]);
	registry.register(second);
	expect(registry.get("studio/scribe")).toBe(second);
	const provider = domain("studio");
	provider.agents.set("scribe", first);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			domains: [provider],
			agents: [second],
		}),
	).rejects.toBeInstanceOf(RuntimeDeclarationCollisionError);
});

test("supplied domains obey active and always-active declarations without implicit roots", async () => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: { activeDomains: ["selected"] },
		domains: [domain("selected"), domain("inactive"), domain("support", true)],
	});
	expect(runtime.domains.map((d) => d.manifest.id)).toEqual([
		"selected",
		"support",
	]);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			domains: [domain("same"), domain("same")],
		}),
	).rejects.toMatchObject({ kind: "domain", id: "same" });
});

test("host chains and config chains form one collection with explicit declaration collision checks", async () => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: { chains: { configured: { chain: "studio/scribe" } } },
		agents: [actor()],
		chains: [
			{ name: "declared", description: "Declared", chain: "studio/scribe" },
		],
	});
	expect(runtime.chains.map((c) => c.name)).toEqual(["configured", "declared"]);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			chains: [
				{ name: "same", description: "A", chain: "actor" },
				{ name: "same", description: "B", chain: "actor" },
			],
		}),
	).rejects.toMatchObject({ kind: "chain", id: "same" });
});

test("package/domain-store discovery is opt-in, even when a project contains domain files", async () => {
	const root = join(tmp.path, ".cosmonauts", "domains", "external");
	await mkdir(root, { recursive: true });
	await writeFile(
		join(root, "domain.ts"),
		'throw new Error("EXPLICIT_DISCOVERY"); export const manifest = { id: "external", description: "External" };',
	);
	expect(
		(
			await CosmonautsRuntime.create({
				projectRoot: tmp.path,
				projectConfig: {},
			})
		).domains,
	).toEqual([]);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			discoverPackages: true,
			includeUserSources: false,
		}),
	).rejects.toThrow("EXPLICIT_DISCOVERY");
});

test("an explicit empty source list overrides directory scanning options", async () => {
	const runtime = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		projectConfig: {},
		domainSources: [],
		builtinDomainsDir: join(tmp.path, "missing"),
		pluginDirs: [join(tmp.path, "also-missing")],
	});
	expect(runtime.domains).toEqual([]);
});

test("explicit domains cannot duplicate a discovered provider", async () => {
	const provider = join(tmp.path, "provider");
	await mkdir(provider);
	await writeFile(
		join(provider, "domain.ts"),
		'export default {id:"same",description:"Discovered"}',
	);
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			domainSources: [
				{
					domainsDir: provider,
					sourceType: "domain-root",
					origin: "provided",
					precedence: 0,
				},
			],
			domains: [domain("same")],
		}),
	).rejects.toMatchObject({ kind: "domain", id: "same" });
});

test("explicit chains cannot duplicate an already configured chain", async () => {
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: { chains: { publish: { chain: "scribe" } } },
			chains: [{ name: "publish", description: "Duplicate", chain: "scribe" }],
		}),
	).rejects.toMatchObject({ kind: "chain", id: "publish" });
});

test("invalid declarations are diagnosed before joining the runtime collision collection", async () => {
	await expect(
		CosmonautsRuntime.create({
			projectRoot: tmp.path,
			projectConfig: {},
			agents: [
				actor(),
				actor({ memory: { episodes: "invalid" as unknown as boolean } }),
			],
		}),
	).rejects.toThrow("Invalid memory grant: episodes");
});

test("user domain discovery requires opt-in and honors explicit user-source exclusion", async () => {
	const home = join(tmp.path, "home");
	const userDomain = join(home, ".cosmonauts", "domains", "user");
	await mkdir(userDomain, { recursive: true });
	await writeFile(
		join(userDomain, "domain.ts"),
		'throw new Error("USER_DISCOVERY_REACHED"); export default {id:"user",description:"User"}',
	);
	vi.stubEnv("HOME", home);
	try {
		await expect(
			CosmonautsRuntime.create({
				projectRoot: tmp.path,
				projectConfig: {},
				includeUserSources: true,
			}),
		).resolves.toMatchObject({ domains: [] });
		await expect(
			CosmonautsRuntime.create({
				projectRoot: tmp.path,
				projectConfig: {},
				discoverPackages: true,
				includeUserSources: false,
			}),
		).resolves.toMatchObject({ domains: [] });
		await expect(
			CosmonautsRuntime.create({
				projectRoot: tmp.path,
				projectConfig: {},
				discoverPackages: true,
			}),
		).rejects.toThrow("USER_DISCOVERY_REACHED");
	} finally {
		vi.unstubAllEnvs();
	}
});
