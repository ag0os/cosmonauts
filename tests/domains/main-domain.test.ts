import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAgentMemoryExtension } from "../../domains/shared/extensions/agent-memory/index.ts";
import { createRegistryFromDomains } from "../../lib/agents/index.ts";
import { buildAgentIdentityMarker } from "../../lib/agents/runtime-identity.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	DomainRegistry,
	DomainResolver,
	loadDomainsFromSources,
	validateDomains,
} from "../../lib/domains/index.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import { createMarkdownMemoryStore } from "../../lib/memory/index.ts";
import {
	buildToolAllowlist,
	resolveExtensionPaths,
	resolveTools,
} from "../../lib/orchestration/definition-resolution.ts";
import { scanDomainSources } from "../../lib/packages/scanner.ts";
import { writeProjectInstalledDomainPackage } from "../helpers/domain-package-fixture.ts";
import { useTempDir } from "../helpers/fs.ts";
import { createMockPi } from "../helpers/mocks/index.ts";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const DOMAINS_DIR = join(REPO_ROOT, "domains");
const MAIN_DOMAIN_DIR = join(DOMAINS_DIR, "main");
const SHARED_DOMAIN_DIR = join(DOMAINS_DIR, "shared");
const MAIN_AGENT_REF = "main/cosmo";
const MAIN_AGENT_ID = MAIN_AGENT_REF.slice("main/".length);

const tmp = useTempDir("main-domain-");
let packageProjectRoot: string;

let domains: LoadedDomain[] = [];
let mainDomain: LoadedDomain;
let cosmo: AgentDefinition;
let resolver: DomainResolver;

beforeAll(async () => {
	packageProjectRoot = await mkdtemp(join(tmpdir(), "main-domain-package-"));
	await writeProjectInstalledDomainPackage(packageProjectRoot, {
		packageName: "synthetic-coding",
		domainId: "coding",
		lead: "cody",
		agents: [{ id: "cody" }],
		prompts: {
			cody: "You're Cody from a synthetic coding package.",
		},
	});
	const sources = await scanDomainSources({
		builtinDomainsDir: DOMAINS_DIR,
		projectRoot: packageProjectRoot,
	});
	domains = await loadDomainsFromSources(sources);

	const loadedMain = domains.find((domain) => domain.manifest.id === "main");
	if (!loadedMain) throw new Error("Main domain not loaded");
	mainDomain = loadedMain;

	const loadedCosmo = mainDomain.agents.get(MAIN_AGENT_ID);
	if (!loadedCosmo) throw new Error("main/cosmo not loaded");
	cosmo = loadedCosmo;

	resolver = new DomainResolver(new DomainRegistry(domains));
});

afterAll(async () => {
	await rm(packageProjectRoot, { recursive: true, force: true });
});

describe("main domain built-in discovery", () => {
	it("loads as a runtime built-in domain source", async () => {
		const sources = await scanDomainSources({
			builtinDomainsDir: DOMAINS_DIR,
			projectRoot: tmp.path,
		});

		expect(sources[0]).toMatchObject({
			domainsDir: DOMAINS_DIR,
			origin: "builtin",
			precedence: 0,
		});
		expect(mainDomain.rootDirs).toEqual([MAIN_DOMAIN_DIR]);
		expect(mainDomain.manifest.id).toBe("main");
		expect(mainDomain.manifest.lead).toBe(MAIN_AGENT_ID);
	});

	it("resolves main/cosmo allowlist excludes cody with direct specialist delegation", () => {
		const registry = createRegistryFromDomains(domains);
		const subagents = cosmo.subagents ?? [];

		expect(registry.resolve("main/cosmo")).toBe(cosmo);
		expect(cosmo.tools).toBe("none");
		expect(cosmo.capabilities).toEqual(["tasks", "spawning", "todo", "drive"]);
		expect(cosmo.capabilities).not.toContain("engineering-discipline");
		expect(subagents.length).toBeGreaterThan(0);
		expect(subagents.every((subagent) => subagent.startsWith("coding/"))).toBe(
			true,
		);
		expect(subagents).not.toContain("coding/cody");
		expect(subagents).not.toContain(`coding/${MAIN_AGENT_ID}`);
	});

	it("validates main/cosmo and resolves the drive capability", () => {
		// @cosmo-behavior plan:coding-agnostic-framework#B-015
		const diagnostics = validateDomains(domains).filter(
			(diagnostic) =>
				diagnostic.domain === "main" &&
				diagnostic.agent === MAIN_AGENT_ID &&
				diagnostic.severity === "error",
		);

		expect(diagnostics).toEqual([]);
		expect(resolver.resolveCapabilityPath("drive", "main")).toBe(
			join(SHARED_DOMAIN_DIR, "capabilities", "drive.md"),
		);
	});

	it("builds main/cosmo tools none allowlist only from extension-registered tools", async () => {
		const extensionPaths = resolveExtensionPaths(cosmo.extensions, {
			domain: "main",
			resolver,
		});
		expect(extensionPaths).toContain(
			join(SHARED_DOMAIN_DIR, "extensions", "agent-memory"),
		);
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
				"recall",
				"remember",
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

	it("frames cosmo as a personal assistant who pulls in specialists when needed", async () => {
		const prompt = await readFile(
			join(MAIN_DOMAIN_DIR, "prompts", "cosmo.md"),
			"utf-8",
		);

		expect(prompt).toContain("You're Cosmo.");
		expect(prompt).toContain("You're a personal assistant.");
		expect(prompt).toContain("You're not a coding agent");
		expect(prompt).toContain("**Pull in specialists when needed.**");
	});

	it("wires agent memory only to main/cosmo and gives concise visible save guidance @cosmo-behavior plan:memory-interface#B-013", async () => {
		const agentDefinitions = await loadBuiltinAgentDefinitions();
		const consumers = agentDefinitions
			.filter((definition) => definition.extensions.includes("agent-memory"))
			.map((definition) => definition.ref)
			.sort();

		expect(consumers).toEqual(["main/cosmo"]);

		const prompt = await readFile(
			join(MAIN_DOMAIN_DIR, "prompts", "cosmo.md"),
			"utf-8",
		);
		expect(prompt).toContain("explicitly asks you to remember");
		expect(prompt).toContain("Use project memory");
		expect(prompt).toContain("user memory");
		expect(prompt).toContain("say what you saved and where");
	});

	it("guides Cosmo to propose profile and playbook saves and call remember only after confirmation @cosmo-behavior plan:profile-playbooks#B-006", async () => {
		const prompt = await readFile(
			join(MAIN_DOMAIN_DIR, "prompts", "cosmo.md"),
			"utf-8",
		);

		expect(prompt).toContain("If the user directly asks for a durable save");
		expect(prompt).toContain("If you notice something worth saving unprompted");
		expect(prompt).toContain("name the intended record type and scope");
		expect(prompt).toContain("Call `remember` only after explicit assent");
		expect(prompt).toContain("Never repeat a declined proposal");
		expect(prompt).toContain(
			"The user profile is the single user-scoped picture",
		);
		expect(prompt).toContain("Project-specific facts do not belong there");
		expect(prompt).toContain(
			"Use a playbook for a named, repeatable procedure",
		);
		expect(prompt).toContain("pass the complete desired body");
		expect(prompt).toContain("user-visible `changeSummary`");
		expect(prompt).toContain("reports `confirmation_required`");
		expect(prompt).toContain("no pending save to reconstruct");
		expect(prompt).toContain(
			"An injected truncated profile excerpt is never an update source",
		);
		expect(prompt).toContain("Use `recall` when you need the full content");

		const projectRoot = join(tmp.path, "confirmed-playbook-project");
		const userCosmonautsRoot = join(tmp.path, "confirmed-playbook-user");
		const storeFactory = vi.fn(
			(options: Parameters<typeof createMarkdownMemoryStore>[0]) =>
				createMarkdownMemoryStore(options),
		);
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot, storeFactory })(
			pi as never,
		);
		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker(MAIN_AGENT_REF) },
			{ cwd: projectRoot },
		);

		const confirmed = (await pi.callTool("remember", {
			type: "playbook",
			title: "Weekly Review",
			scope: "user",
			description: "Use at the end of each week.",
			content: "When to use: Friday afternoon.\n\n1. Review.\n2. Plan.",
		})) as {
			content: { type: string; text: string }[];
			details: Record<string, unknown>;
		};

		expect(confirmed.details).toMatchObject({
			status: "created",
			type: "playbook",
			title: "Weekly Review",
			scope: "user",
			humanPath: ".cosmonauts/memory/agent/playbooks/weekly-review.md",
		});
		expect(confirmed.content[0]?.text).toContain(
			'Created playbook "Weekly Review" in user memory',
		);
		expect(storeFactory).toHaveBeenCalledWith(
			expect.objectContaining({ projectRoot, userCosmonautsRoot }),
		);
	});

	it("keeps W2 memory Cosmo only without broadening the tool allowlist @cosmo-behavior plan:profile-playbooks#B-019", async () => {
		const extensionPaths = resolveExtensionPaths(cosmo.extensions, {
			domain: "main",
			resolver,
		});
		const agentMemoryPath = extensionPaths.find((path) =>
			path.endsWith(join("extensions", "agent-memory")),
		);
		expect(agentMemoryPath).toBeDefined();
		if (!agentMemoryPath)
			throw new Error("agent-memory extension not resolved");

		const extensionToolGroups =
			await collectExtensionToolGroups(extensionPaths);
		const registeredToolNames = [...new Set(extensionToolGroups.flat())].sort();
		const agentMemoryTools = (
			await collectExtensionToolGroups([agentMemoryPath])
		)
			.flat()
			.sort();
		const builtInTools = resolveTools(cosmo.tools, REPO_ROOT);
		const allowlist = buildToolAllowlist(
			builtInTools,
			fakeLoader(extensionToolGroups),
		).sort();

		expect(agentMemoryTools).toEqual(["recall", "remember"]);
		expect(builtInTools).toEqual([]);
		expect(allowlist).toEqual(registeredToolNames);

		const consumers = (await loadBuiltinAgentDefinitions())
			.filter((definition) => definition.extensions.includes("agent-memory"))
			.map((definition) => definition.ref)
			.sort();
		expect(consumers).toEqual([MAIN_AGENT_REF]);

		const projectRoot = join(tmp.path, "w2-authorization-project");
		const userCosmonautsRoot = join(tmp.path, "w2-authorization-user");
		const storeFactory = vi.fn(
			(options: Parameters<typeof createMarkdownMemoryStore>[0]) =>
				createMarkdownMemoryStore(options),
		);
		const pi = createMockPi({ cwd: projectRoot });
		createAgentMemoryExtension({ userCosmonautsRoot, storeFactory })(
			pi as never,
		);
		expect([...pi.tools.keys()].sort()).toEqual(["recall", "remember"]);

		await pi.fireEvent(
			"before_agent_start",
			{ systemPrompt: buildAgentIdentityMarker("main/not-cosmo") },
			{ cwd: projectRoot },
		);
		for (const [tool, params] of [
			["remember", { content: "Must not be stored." }],
			["recall", { query: "Must not be read." }],
		] as const) {
			const result = (await pi.callTool(tool, params)) as {
				details: Record<string, unknown>;
			};
			expect(result.details).toMatchObject({ status: "unauthorized" });
		}
		expect(storeFactory).not.toHaveBeenCalled();
		await expect(readdir(join(projectRoot, "memory"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(
			readdir(join(userCosmonautsRoot, "memory")),
		).rejects.toMatchObject({ code: "ENOENT" });
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

async function loadBuiltinAgentDefinitions(): Promise<
	{ ref: string; extensions: readonly string[] }[]
> {
	const definitions: { ref: string; extensions: readonly string[] }[] = [];
	const roots = [
		{ domain: "main", dir: join(DOMAINS_DIR, "main", "agents") },
		{ domain: "coding", dir: join(REPO_ROOT, "bundled", "coding", "agents") },
	];

	for (const root of roots) {
		const entries = await readdir(root.dir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
			const mod = (await import(join(root.dir, entry.name))) as {
				default?: AgentDefinition;
			};
			if (!mod.default) continue;
			definitions.push({
				ref: `${root.domain}/${mod.default.id}`,
				extensions: mod.default.extensions,
			});
		}
	}

	return definitions;
}
