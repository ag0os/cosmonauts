import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
	hasRunnableDefaultDomain,
	resolveInteractiveExtensionPaths,
} from "../../cli/main.ts";
import { resolveDefaultLead } from "../../lib/agents/resolve-default-lead.ts";
import { AgentRegistry } from "../../lib/agents/resolver.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	AmbiguousDefaultDomainError,
	resolveDefaultDomain,
	selectDefaultDomain,
} from "../../lib/domains/default-domain.ts";
import {
	DomainIdConflictError,
	loadDomains,
	loadDomainsFromSources,
} from "../../lib/domains/loader.ts";
import { assemblePrompts } from "../../lib/domains/prompt-assembly.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { directoryResourcePaths } from "../../lib/domains/resource-paths.ts";
import type { DomainManifest, LoadedDomain } from "../../lib/domains/types.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, readdir: vi.fn(actual.readdir) };
});

const tmp = useTempDir("domain-contracts-");
function domain(manifest: DomainManifest): LoadedDomain {
	return {
		manifest,
		portable: manifest.portable ?? false,
		agents: new Map(),
		capabilities: new Set(),
		prompts: new Set(),
		extensions: new Set(),
		skills: new Set(),
		chains: [],
		provenance: [],
		rootDirs: [],
	};
}
function runtime(domains: LoadedDomain[]) {
	return { domains } as unknown as CosmonautsRuntime;
}

test("runnable selection accepts ordinary providers with or without a lead and excludes fallback-only providers", () => {
	const support = domain({
		id: "support",
		description: "Fallback",
		resourceFallback: true,
		lead: "fallback-lead",
	});
	const empty = domain({ id: "empty", description: "No lead" });
	const studio = domain({
		id: "studio",
		description: "Consumer",
		lead: "scribe",
	});
	expect(hasRunnableDefaultDomain(runtime([support]))).toBe(false);
	expect(hasRunnableDefaultDomain(runtime([support, empty]))).toBe(true);
	expect(hasRunnableDefaultDomain(runtime([support, empty, studio]))).toBe(
		true,
	);
	expect(hasRunnableDefaultDomain(runtime([]))).toBe(false);
});

test("registers real live-session commands including domain-bind", () => {
	const binding = new URL(
		"../../domains/shared/extensions/domain-bindings",
		import.meta.url,
	).pathname;
	const paths = resolveInteractiveExtensionPaths({
		domainResolver: {
			resolveExtensionPath: (name: string) =>
				name === "domain-bindings" ? binding : undefined,
		},
	});
	expect(paths).toEqual([
		new URL("../../lib/extensions/agent-switch", import.meta.url).pathname,
		binding,
	]);
	for (const path of paths) expect(existsSync(path)).toBe(true);
});

test("fallback lead selection skips both fallback providers and providers without a lead", () => {
	const def: AgentDefinition = {
		id: "scribe",
		domain: "studio",
		description: "Writer",
		model: "test/model",
		capabilities: [],
		extensions: [],
		skills: [],
		tools: "none",
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
	const domains = [
		domain({ id: "empty", description: "No lead" }),
		domain({
			id: "support",
			description: "Fallback",
			resourceFallback: true,
			lead: "unavailable",
		}),
		domain({ id: "studio", description: "Ordinary", lead: "scribe" }),
	];
	expect(
		resolveDefaultLead(
			{
				domains,
				agentRegistry: new AgentRegistry([def]),
				domainRegistry: new DomainRegistry(domains),
			},
			{},
		),
	).toBe(def);
});

test("default ambiguity identifies every conflicting declaration and directory defaults are trimmed", () => {
	const first = domain({ id: "first", description: "First", default: true });
	const second = domain({ id: "second", description: "Second", default: true });
	try {
		selectDefaultDomain([first, second]);
		throw new Error("Expected ambiguity");
	} catch (error) {
		expect(error).toBeInstanceOf(AmbiguousDefaultDomainError);
		expect((error as AmbiguousDefaultDomainError).domains).toEqual([
			"first",
			"second",
		]);
	}
	expect(resolveDefaultDomain({ defaultDomain: " studio " })).toBe("studio");
});

test("portable own providers occur once in the common resource order", () => {
	const own = domain({ id: "studio", description: "Own", portable: true });
	const support = domain({
		id: "support",
		description: "Support",
		resourceFallback: true,
	});
	expect(new DomainRegistry([own, support]).resourceOrder("studio")).toEqual([
		own,
		support,
	]);
});

test("directory resource paths use only explicit roots, domains and deduplicated fallbacks", () => {
	const resource = { kind: "prompts" as const, filename: "actor.md" };
	expect(directoryResourcePaths(resource)).toEqual([]);
	expect(
		directoryResourcePaths({
			...resource,
			domain: "studio",
			fallbackDomains: ["support"],
		}),
	).toEqual([]);
	expect(
		directoryResourcePaths({ ...resource, domainsDir: "/consumer" }),
	).toEqual([]);
	expect(
		directoryResourcePaths({
			...resource,
			domainsDir: "/consumer",
			fallbackDomains: ["support"],
		}),
	).toEqual(["/consumer/support/prompts/actor.md"]);
	expect(
		directoryResourcePaths({
			...resource,
			domainsDir: "/consumer",
			domain: "studio",
			fallbackDomains: ["support", "studio"],
		}),
	).toEqual([
		"/consumer/studio/prompts/actor.md",
		"/consumer/support/prompts/actor.md",
	]);
});

async function provider(label: string, precedence: number) {
	const root = join(tmp.path, label);
	await mkdir(root, { recursive: true });
	await writeFile(
		join(root, "domain.ts"),
		'export const manifest = { id: "studio", description: "Provider", alwaysActive: true };',
	);
	return {
		domainsDir: root,
		kind: "domain-root" as const,
		origin: label,
		precedence,
	};
}

test("custom merging receives exact overlap metadata for every resource kind", async () => {
	const lower = await provider("lower", 0);
	const higher = await provider("higher", 1);
	for (const root of [lower.domainsDir, higher.domainsDir]) {
		for (const kind of ["capabilities", "prompts", "skills", "extensions"]) {
			await mkdir(join(root, kind, "common"), { recursive: true });
			if (kind === "capabilities" || kind === "prompts")
				await writeFile(join(root, kind, "common.md"), "Common");
		}
		await mkdir(join(root, "agents"));
		await writeFile(
			join(root, "agents", "common.ts"),
			'export default { id:"common", description:"Actor", instructions:{kind:"inline",content:"Actor"}, tools:"none", capabilities:[], extensions:[], skills:[], memory:{}, projectContext:false, session:"ephemeral", loop:false };',
		);
	}
	for (const kind of ["capabilities", "prompts"])
		await writeFile(
			join(higher.domainsDir, kind, "higher-only.md"),
			"Higher only",
		);
	for (const kind of ["skills", "extensions"])
		await mkdir(join(higher.domainsDir, kind, "higher-only"));
	await writeFile(
		join(higher.domainsDir, "agents", "higher-only.ts"),
		'export default { id:"higher-only", description:"Actor", instructions:{kind:"inline",content:"Actor"}, model:"test/model", tools:"none", capabilities:[], extensions:[], skills:[], memory:{}, projectContext:false, session:"ephemeral", loop:false };',
	);
	let decisions = 0;
	await loadDomainsFromSources(
		[higher, lower],
		(conflict) => {
			decisions++;
			expect(conflict.overlapping).toEqual({
				agents: ["common"],
				capabilities: ["common"],
				prompts: ["common"],
				skills: ["common"],
				extensions: ["common"],
			});
			return "merge";
		},
		{ activeDomainIds: [] },
	);
	expect(decisions).toBe(1);
});

test("custom activation rejects same-precedence providers before asking the strategy to skip them", async () => {
	const first = await provider("first", 0);
	const second = await provider("second", 1);
	const conflicting = await provider("conflicting", 1);
	let decisions = 0;
	await expect(
		loadDomainsFromSources(
			[first, second, conflicting],
			() => {
				decisions++;
				return decisions === 1 ? "merge" : "skip";
			},
			{ activeDomainIds: [] },
		),
	).rejects.toBeInstanceOf(DomainIdConflictError);
	expect(decisions).toBe(1);
});

test("prompt I/O failures are propagated rather than hidden by a fallback provider", async () => {
	await mkdir(join(tmp.path, "studio", "capabilities", "broken.md"), {
		recursive: true,
	});
	await mkdir(join(tmp.path, "support", "capabilities"), { recursive: true });
	await writeFile(
		join(tmp.path, "support", "capabilities", "broken.md"),
		"Fallback cannot hide unreadable primary",
	);
	await expect(
		assemblePrompts({
			agentId: "writer",
			domain: "studio",
			domainsDir: tmp.path,
			fallbackDomains: ["support"],
			capabilities: ["broken"],
			instructions: { kind: "inline", content: "Write" },
		}),
	).rejects.toMatchObject({ code: "EISDIR" });
});

for (const action of ["merge", "replace"] as const) {
	test(`later custom decisions see the resource/provenance state of an earlier ${action}`, async () => {
		const sources = [
			await provider("base", 0),
			await provider("middle", 1),
			await provider("last", 2),
		];
		for (const source of sources) {
			await mkdir(join(source.domainsDir, "capabilities"));
			await writeFile(
				join(source.domainsDir, "capabilities", `${source.origin}.md`),
				source.origin,
			);
		}
		let decisions = 0;
		await loadDomainsFromSources(
			sources,
			(conflict) => {
				decisions++;
				if (decisions === 1) return action;
				expect([...conflict.existing.capabilities]).toEqual(
					action === "merge" ? ["base", "middle"] : ["middle"],
				);
				expect(conflict.existing.provenance.map((p) => p.origin)).toEqual(
					action === "merge" ? ["middle", "base"] : ["middle"],
				);
				return "merge";
			},
			{ activeDomainIds: [] },
		);
		expect(decisions).toBe(2);
	});
}

test("an explicit consumer session policy overrides every manifest default", async () => {
	const roots = join(tmp.path, "providers");
	await mkdir(roots);
	const policy = { forAgent: () => undefined };
	const built = await CosmonautsRuntime.create({
		projectRoot: tmp.path,
		builtinDomainsDir: roots,
		includeUserSources: false,
		sessionPolicies: policy,
	});
	expect(built.sessionPolicies).toBe(policy);
});

test("domain modules are evaluated in deterministic discovery order before resource indexing", async () => {
	const root = join(tmp.path, "discovery");
	const key = Symbol.for("cosmonauts:test-domain-import-order");
	const globals = globalThis as Record<symbol, unknown>;
	const order: string[] = [];
	globals[key] = order;
	try {
		for (const id of ["alpha", "zeta"]) {
			await mkdir(join(root, id), { recursive: true });
			await writeFile(
				join(root, id, "domain.ts"),
				`const order = (globalThis as Record<symbol, string[]>)[Symbol.for("cosmonauts:test-domain-import-order")]; order.push("${id}"); export const manifest = { id: "${id}", description: "Domain" };`,
			);
		}
		const entries = await fs.readdir(root, { withFileTypes: true });
		vi.mocked(fs.readdir).mockResolvedValueOnce(
			entries.sort((a, b) => b.name.localeCompare(a.name)) as never,
		);
		expect((await loadDomains(root)).map((d) => d.manifest.id)).toEqual([
			"alpha",
			"zeta",
		]);
		expect(order).toEqual(["alpha", "zeta"]);
	} finally {
		delete globals[key];
	}
});

test("an absent bindings provider leaves only the existing library agent-switch mount", () => {
	const paths = resolveInteractiveExtensionPaths({
		domainResolver: { resolveExtensionPath: () => undefined },
	});
	expect(paths).toEqual([
		new URL("../../lib/extensions/agent-switch", import.meta.url).pathname,
	]);
	expect(existsSync(paths[0] ?? "")).toBe(true);
});
