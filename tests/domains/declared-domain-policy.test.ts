import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { resolveDefaultLead } from "../../lib/agents/resolve-default-lead.ts";
import { createRegistryFromDomains } from "../../lib/agents/resolver.ts";
import { resolveEffectiveProjectSkills } from "../../lib/agents/skills.ts";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import {
	loadNamedChains,
	selectDomainChains,
} from "../../lib/chains/loader.ts";
import {
	AmbiguousDefaultDomainError,
	NoDefaultDomainError,
	resolveDefaultDomain,
} from "../../lib/domains/default-domain.ts";
import {
	DomainIdConflictError,
	loadDomainsFromSources,
} from "../../lib/domains/loader.ts";
import { DomainRegistry } from "../../lib/domains/registry.ts";
import { DomainResolver } from "../../lib/domains/resolver.ts";
import type { DomainManifest, LoadedDomain } from "../../lib/domains/types.ts";
import { validateDomains } from "../../lib/domains/validator.ts";
import { CosmonautsRuntime } from "../../lib/runtime.ts";
import { useTempDir } from "../helpers/fs.ts";

const tmp = useTempDir("declared-domain-policy-");
function domain(
	manifest: DomainManifest,
	resources: string[] = ["common"],
): LoadedDomain {
	return {
		manifest,
		portable: manifest.portable ?? false,
		agents: new Map(),
		capabilities: new Set(resources),
		prompts: new Set(resources),
		skills: new Set(resources),
		extensions: new Set(resources),
		chains: [],
		provenance: [],
		rootDirs: [join(tmp.path, manifest.id)],
	};
}

test("registry and path resolution share declared own, portable and fallback precedence", () => {
	const fallback = domain({
		id: "z-support",
		description: "Fallback",
		resourceFallback: true,
		portable: true,
	});
	const portable = domain({
		id: "a-toolkit",
		description: "Portable",
		portable: true,
	});
	const own = domain({ id: "workspace", description: "Own" });
	const registry = new DomainRegistry([fallback, portable, own]);
	const resolver = new DomainResolver(registry);
	for (const [preferred, expected] of [
		["workspace", own],
		[undefined, portable],
		["z-support", portable],
	] as const) {
		expect(registry.resolveCapability("common", preferred)).toBe(expected);
		expect(resolver.resolveCapabilityPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "capabilities", "common.md"),
		);
		expect(resolver.resolvePersonaPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "prompts", "common.md"),
		);
		expect(resolver.resolveExtensionPath("common", preferred)).toBe(
			join(tmp.path, expected.manifest.id, "extensions", "common"),
		);
	}
});

test("a fallback needs no special name or portable grant and remains last for its own lookup", () => {
	const fallback = domain({
		id: "support",
		description: "Fallback",
		resourceFallback: true,
	});
	const registry = new DomainRegistry([
		fallback,
		domain({ id: "workspace", description: "Own" }, []),
	]);
	expect(registry.resolveCapability("common", "workspace")).toBe(fallback);
	expect(registry.resourceOrder("support")).toEqual([fallback]);
	expect(registry.listResourceFallbacks()).toEqual([fallback]);
});

test("the old shared spelling has no authority without a declared fallback trait", () => {
	const ordinary = domain({ id: "shared", description: "Ordinary" });
	const fallback = domain({
		id: "support",
		description: "Fallback",
		resourceFallback: true,
	});
	const registry = new DomainRegistry([ordinary, fallback]);
	expect(registry.resolveCapability("common")).toBe(fallback);
	expect(registry.resolveCapability("common", "shared")).toBe(ordinary);
	expect(registry.resourceOrder("shared")).toEqual([ordinary, fallback]);
	expect(registry.resolveCapability("missing")).toBeUndefined();
});

test("multiple fallback providers retain declaration order and skill roots appear only once", () => {
	const first = domain({
		id: "z-support",
		description: "First",
		resourceFallback: true,
		portable: true,
	});
	const second = domain({
		id: "a-support",
		description: "Second",
		resourceFallback: true,
	});
	const own = domain({ id: "workspace", description: "Own" });
	const registry = new DomainRegistry([first, own, second]);
	expect(registry.resourceOrder()).toEqual([first, second]);
	expect(registry.resolveCapability("common")).toBe(first);
	expect(new DomainResolver(registry).allSkillDirs()).toEqual(
		[own, first, second].map((d) => join(tmp.path, d.manifest.id, "skills")),
	);
});

async function provider(
	label: string,
	manifest: DomainManifest,
	precedence: number,
) {
	const root = join(tmp.path, label);
	await mkdir(root, { recursive: true });
	await writeFile(
		join(root, "domain.ts"),
		`export default ${JSON.stringify(manifest)};`,
	);
	return {
		domainsDir: root,
		origin: label,
		precedence,
		kind: "domain-root" as const,
	};
}

test("only an effective always-active grant bypasses a narrowed active list", async () => {
	const support = await provider(
		"support",
		{ id: "support", description: "Renamed support", alwaysActive: true },
		0,
	);
	const ordinary = await provider(
		"ordinary",
		{ id: "shared", description: "No magic name" },
		0,
	);
	expect(
		(
			await loadDomainsFromSources([ordinary, support], undefined, {
				activeDomainIds: [],
			})
		).map((d) => d.manifest.id),
	).toEqual(["support"]);
});

test.each([
	false,
	undefined,
])("a higher provider's %s activation policy replaces a lower grant", async (alwaysActive) => {
	const lower = await provider(
		"lower",
		{ id: "support", description: "Lower", alwaysActive: true },
		0,
	);
	const higher = await provider(
		"higher",
		{ id: "support", description: "Higher", alwaysActive },
		1,
	);
	expect(
		await loadDomainsFromSources([higher, lower], undefined, {
			activeDomainIds: [],
		}),
	).toEqual([]);
	const [active] = await loadDomainsFromSources([higher, lower], undefined, {
		activeDomainIds: ["support"],
	});
	expect(active?.manifest.description).toBe("Higher");
	expect(active?.rootDirs).toEqual([higher.domainsDir, lower.domainsDir]);
});

test("conflicting providers are checked only when their effective policy activates them", async () => {
	const first = await provider(
		"first",
		{ id: "support", description: "First", alwaysActive: true },
		0,
	);
	const second = await provider(
		"second",
		{ id: "support", description: "Second", alwaysActive: false },
		0,
	);
	await expect(
		loadDomainsFromSources([first, second], undefined, { activeDomainIds: [] }),
	).rejects.toBeInstanceOf(DomainIdConflictError);
	const override = await provider(
		"override",
		{ id: "support", description: "Override", alwaysActive: false },
		1,
	);
	expect(
		await loadDomainsFromSources([first, second, override], undefined, {
			activeDomainIds: [],
		}),
	).toEqual([]);
});

function actor(): AgentDefinition {
	return {
		id: "actor",
		domain: "workspace",
		description: "Consumer",
		instructions: { kind: "inline", content: "Act." },
		model: "test/model",
		tools: "none",
		capabilities: ["common"],
		extensions: ["common"],
		skills: [],
		projectContext: false,
		session: "ephemeral",
		loop: false,
	};
}

test("validator resources follow declared fallbacks without exempting a domain spelling", () => {
	const consumer = domain({ id: "workspace", description: "Consumer" }, []);
	consumer.agents.set("actor", actor());
	const fallback = domain({
		id: "support",
		description: "Support",
		resourceFallback: true,
	});
	expect(validateDomains([consumer, fallback])).toEqual([]);
	const ordinary = domain({ id: "shared", description: "Ordinary" });
	expect(validateDomains([consumer, ordinary]).map((d) => d.message)).toEqual([
		'Capability "common" not found in the declared resource providers for domain "workspace"',
		'Extension "common" not found in the declared resource providers for domain "workspace"',
	]);
});

test("chain collections include declared fallbacks and contextual definitions win collisions", async () => {
	const own = {
		...domain({ id: "workspace", description: "Own" }),
		chains: [{ name: "flow", description: "Own", chain: "actor" }],
	};
	const fallback = {
		...domain({
			id: "support",
			description: "Fallback",
			resourceFallback: true,
		}),
		chains: [{ name: "flow", description: "Fallback", chain: "helper" }],
	};
	const ordinary = {
		...domain({ id: "shared", description: "Ordinary" }),
		chains: [{ name: "other", description: "Other", chain: "helper" }],
	};
	const selected = selectDomainChains([own, ordinary, fallback], "workspace");
	expect(selected).toEqual([...fallback.chains, ...own.chains]);
	expect(await loadNamedChains(tmp.path, selected)).toEqual(own.chains);
});

test("effective project skills use every declared fallback and directory callers declare providers", async () => {
	for (const id of ["first", "second", "shared"]) {
		const path = join(tmp.path, id, "skills", id);
		await mkdir(path, { recursive: true });
		await writeFile(
			join(path, "SKILL.md"),
			`---\nname: ${id}\ndescription: ${id}\n---\n`,
		);
	}
	const first = domain({
		id: "first",
		description: "First",
		resourceFallback: true,
	});
	const second = domain({
		id: "second",
		description: "Second",
		resourceFallback: true,
	});
	const ordinary = domain({ id: "shared", description: "Ordinary" });
	const resolver = new DomainResolver(
		new DomainRegistry([first, ordinary, second]),
	);
	expect(
		await resolveEffectiveProjectSkills({
			projectSkills: ["project"],
			resolver,
		}),
	).toEqual(["first", "second", "project"]);
	expect(
		await resolveEffectiveProjectSkills({
			projectSkills: [],
			domainsDir: tmp.path,
		}),
	).toEqual([]);
	expect(
		await resolveEffectiveProjectSkills({
			projectSkills: [],
			domainsDir: tmp.path,
			fallbackDomains: ["second"],
		}),
	).toEqual(["second"]);
});

test("a renamed declared default supplies resources and its lead ahead of ordinary domain names", () => {
	const ordinary = domain({
		id: "main",
		description: "Ordinary",
		lead: "actor",
	});
	ordinary.agents.set("actor", { ...actor(), domain: "main" });
	const control = domain({
		id: "control",
		description: "Default",
		default: true,
		lead: "actor",
	});
	control.agents.set("actor", { ...actor(), domain: "control" });
	const domains = [ordinary, control];
	const registry = new DomainRegistry(domains);
	expect(resolveDefaultDomain({ resolver: new DomainResolver(registry) })).toBe(
		"control",
	);
	expect(
		resolveDefaultLead(
			{
				domains,
				domainRegistry: registry,
				agentRegistry: createRegistryFromDomains(domains),
			},
			{},
		).domain,
	).toBe("control");
	expect(() =>
		resolveDefaultDomain({
			resolver: new DomainResolver(new DomainRegistry([ordinary])),
		}),
	).toThrow(NoDefaultDomainError);
});

test("multiple default declarations fail direct selection and runtime loading", async () => {
	const first = domain({ id: "first", description: "First", default: true });
	const second = domain({ id: "second", description: "Second", default: true });
	expect(() =>
		resolveDefaultDomain({
			resolver: new DomainResolver(new DomainRegistry([first, second])),
		}),
	).toThrow(AmbiguousDefaultDomainError);
	await provider("first", first.manifest, 0);
	await provider("second", second.manifest, 0);
	await expect(
		CosmonautsRuntime.create({
			builtinDomainsDir: tmp.path,
			projectRoot: tmp.path,
			includeUserSources: false,
		}),
	).rejects.toBeInstanceOf(AmbiguousDefaultDomainError);
});

test("only the owning identity keeps its explicitly named private skills under a project filter", async () => {
	const path = join(tmp.path, "owner", "skills", "secret");
	await mkdir(path, { recursive: true });
	await writeFile(
		join(path, "SKILL.md"),
		"---\nname: secret\ndescription: Secret\n---\n",
	);
	const owner = domain({
		id: "owner",
		description: "Owner",
		internal: { skills: ["secret"] },
	});
	const resolver = new DomainResolver(new DomainRegistry([owner]));
	expect(
		await resolveEffectiveProjectSkills({
			resolver,
			projectSkills: [],
			agent: { domain: "owner", skills: ["secret"] },
		}),
	).toEqual(["secret"]);
	expect(
		await resolveEffectiveProjectSkills({
			resolver,
			projectSkills: [],
			agent: { skills: ["secret"] },
		}),
	).toEqual([]);
});

for (const lowerGrant of [true, false]) {
	test(`a skipped provider cannot change the retained activation grant (${lowerGrant})`, async () => {
		const lower = await provider(
			"skip-lower",
			{ id: "support", description: "Retained", alwaysActive: lowerGrant },
			0,
		);
		const higher = await provider(
			"skip-higher",
			{ id: "support", description: "Discarded", alwaysActive: !lowerGrant },
			1,
		);
		let decisions = 0;
		const result = await loadDomainsFromSources(
			[higher, lower],
			() => {
				decisions++;
				return "skip";
			},
			{ activeDomainIds: [] },
		);
		expect(result.map((domain) => domain.manifest.description)).toEqual(
			lowerGrant ? ["Retained"] : [],
		);
		expect(decisions).toBe(1);
	});
}
