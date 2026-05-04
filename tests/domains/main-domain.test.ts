import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	DomainRegistry,
	DomainResolver,
	loadDomainsFromSources,
	validateDomains,
} from "../../lib/domains/index.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import {
	buildToolAllowlist,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/definition-resolution.ts";
import { scanDomainSources } from "../../lib/packages/scanner.ts";
import { useTempDir } from "../helpers/fs.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DOMAINS_DIR = join(REPO_ROOT, "domains");
const BUNDLED_CODING_DIR = join(REPO_ROOT, "bundled", "coding");
const MAIN_DOMAIN_DIR = join(DOMAINS_DIR, "main");

const tmp = useTempDir("main-domain-");

let domains: LoadedDomain[] = [];
let mainDomain: LoadedDomain;
let cosmo: AgentDefinition;
let resolver: DomainResolver;

beforeAll(async () => {
	domains = await loadDomainsFromSources([
		{ domainsDir: DOMAINS_DIR, origin: "builtin", precedence: 0 },
		{
			domainsDir: BUNDLED_CODING_DIR,
			origin: "bundled:coding",
			precedence: 0.5,
		},
	]);

	const loadedMain = domains.find((domain) => domain.manifest.id === "main");
	if (!loadedMain) throw new Error("Main domain not loaded");
	mainDomain = loadedMain;

	const loadedCosmo = mainDomain.agents.get("cosmo");
	if (!loadedCosmo) throw new Error("main/cosmo not loaded");
	cosmo = loadedCosmo;

	resolver = new DomainResolver(new DomainRegistry(domains));
});

describe("main domain", () => {
	it("loads as a runtime built-in domain source", async () => {
		const sources = await scanDomainSources({
			builtinDomainsDir: DOMAINS_DIR,
			projectRoot: tmp.path,
			bundledDirs: [BUNDLED_CODING_DIR],
		});

		expect(sources[0]).toMatchObject({
			domainsDir: DOMAINS_DIR,
			origin: "builtin",
			precedence: 0,
		});
		expect(mainDomain.rootDirs).toEqual([MAIN_DOMAIN_DIR]);
		expect(mainDomain.manifest.id).toBe("main");
		expect(mainDomain.manifest.lead).toBe("cosmo");
	});

	it("resolves main/cosmo with direct specialist delegation", () => {
		const registry = createRegistryFromDomains(domains);
		const subagents = cosmo.subagents ?? [];

		expect(registry.resolve("main/cosmo")).toBe(cosmo);
		expect(cosmo.tools).toBe("none");
		expect(cosmo.capabilities).toEqual([
			"core",
			"tasks",
			"spawning",
			"todo",
			"fleet",
		]);
		expect(cosmo.capabilities).not.toContain("engineering-discipline");
		expect(subagents.length).toBeGreaterThan(0);
		expect(subagents.every((subagent) => subagent.startsWith("coding/"))).toBe(
			true,
		);
		expect(subagents).not.toContain("coding/cody");
		expect(subagents).not.toContain("coding/cosmo");
	});

	it("validates main/cosmo and resolves the fleet capability", () => {
		const diagnostics = validateDomains(domains).filter(
			(diagnostic) =>
				diagnostic.domain === "main" &&
				diagnostic.agent === "cosmo" &&
				diagnostic.severity === "error",
		);

		expect(diagnostics).toEqual([]);
		expect(resolver.resolveCapabilityPath("fleet", "main")).toBe(
			join(MAIN_DOMAIN_DIR, "capabilities", "fleet.md"),
		);
	});

	it("builds a tool allowlist only from extension-registered tools", async () => {
		const extensionPaths = resolveExtensionPaths(cosmo.extensions, {
			domain: "main",
			resolver,
		});
		const extensionToolGroups =
			await collectExtensionToolGroups(extensionPaths);
		const registeredToolNames = [...new Set(extensionToolGroups.flat())].sort();
		const builtInTools = resolveTools(cosmo.tools, REPO_ROOT);
		const allowlist = buildToolAllowlist(
			builtInTools,
			fakeLoader(extensionToolGroups),
		).sort();

		expect(builtInTools).toEqual([]);
		expect(registeredToolNames).toEqual(
			expect.arrayContaining([
				"chain_run",
				"plan_create",
				"run_driver",
				"spawn_agent",
				"task_create",
				"todo_read",
				"watch_events",
			]),
		);
		expect(allowlist).toEqual(registeredToolNames);
		for (const tool of ["read", "bash", "edit", "write"]) {
			expect(allowlist).not.toContain(tool);
		}
	});

	it("documents direct delegation and fleet fallback behavior", async () => {
		const prompt = await readFile(
			join(MAIN_DOMAIN_DIR, "prompts", "cosmo.md"),
			"utf-8",
		);

		expect(prompt).toContain("`coding/planner`");
		expect(prompt).toContain("`coding/worker`");
		expect(prompt).toContain("Do **not** delegate through `coding/cody`");
		expect(prompt).toContain("driver primitives are absent");
		expect(prompt).toContain("degrade gracefully");
	});
});

type ExtensionFactory = (api: unknown) => void;

async function collectExtensionToolGroups(
	extensionPaths: readonly string[],
): Promise<string[][]> {
	const groups: string[][] = [];

	for (const extensionPath of extensionPaths) {
		const names: string[] = [];
		const extension = await loadExtension(extensionPath);
		extension(createToolCollector(names));
		groups.push(names);
	}

	return groups;
}

async function loadExtension(extensionPath: string): Promise<ExtensionFactory> {
	const mod = (await import(join(extensionPath, "index.ts"))) as {
		default?: unknown;
	};
	if (typeof mod.default !== "function") {
		throw new Error(`Extension has no default export: ${extensionPath}`);
	}
	return mod.default as ExtensionFactory;
}

function createToolCollector(names: string[]): unknown {
	return {
		registerTool(tool: { name: string }): void {
			names.push(tool.name);
		},
		registerCommand(): void {},
		registerMessageRenderer(): void {},
		on(): void {},
		appendEntry(): void {},
		sendMessage(): void {},
		sendUserMessage(): void {},
	};
}

function fakeLoader(
	extensionToolGroups: readonly (readonly string[])[],
): Parameters<typeof buildToolAllowlist>[1] {
	const extensions = extensionToolGroups.map((names) => ({
		tools: new Map(names.map((name) => [name, { name }])),
	}));

	return {
		getExtensions: () => ({ extensions, errors: [], runtime: {} }),
	} as unknown as Parameters<typeof buildToolAllowlist>[1];
}
