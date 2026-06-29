import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDefinition } from "../../lib/agents/types.ts";
import type { NamedChain } from "../../lib/chains/types.ts";
import type { LoadedDomain } from "../../lib/domains/types.ts";
import type {
	InstallMeta,
	InstallResult,
} from "../../lib/packages/installer.ts";
import type {
	DomainSource,
	InstalledPackage,
	PackageManifest,
} from "../../lib/packages/types.ts";

export function createInstalledPackageFixture(
	name: string,
	scope: "user" | "project" = "user",
): InstalledPackage {
	return {
		manifest: {
			name,
			version: "1.0.0",
			description: `Package ${name}`,
			domains: [{ name: "alpha", path: "domains/alpha" }],
		},
		installPath: `/store/${name}`,
		scope,
		installedAt: new Date(),
	};
}

export function createInstallResultFixture(
	overrides: Partial<InstallResult> = {},
): InstallResult {
	return {
		manifest: overrides.manifest ?? {
			name: "new-pkg",
			version: "1.0.0",
			description: "Test",
			domains: [{ name: "alpha", path: "domains/alpha" }],
		},
		installedTo: overrides.installedTo ?? "/store/new-pkg",
		domainMergeResults: overrides.domainMergeResults ?? [],
	};
}

export function createInstallMetaFixture(
	source: string,
	extra: Record<string, unknown> = {},
): InstallMeta {
	return {
		source,
		installedAt: "2024-01-01T00:00:00.000Z",
		...extra,
	} as InstallMeta;
}

export interface SyntheticDomainAgentFixture {
	id: string;
	description?: string;
	capabilities?: readonly string[];
	model?: string;
	tools?: AgentDefinition["tools"];
	extensions?: readonly string[];
	skills?: readonly string[];
	subagents?: readonly string[];
	projectContext?: boolean;
	session?: AgentDefinition["session"];
	loop?: boolean;
}

export interface SyntheticInstallableDomainPackageOptions {
	packageName?: string;
	domainId?: string;
	domainDescription?: string;
	lead?: string;
	portable?: boolean;
	internal?: Record<string, readonly string[]>;
	domainPath?: "." | string;
	agents?: readonly SyntheticDomainAgentFixture[];
	prompts?: Record<string, string>;
	capabilities?: Record<string, string>;
	skills?: Record<string, string>;
	chains?: readonly NamedChain[];
}

export interface SyntheticInstallableDomainPackageFixture {
	packageName: string;
	packageRoot: string;
	domainRoot: string;
	domainId: string;
	manifest: PackageManifest;
}

export interface LoadedSyntheticProjectDomainPackageFixture
	extends SyntheticInstallableDomainPackageFixture {
	sources: DomainSource[];
	packageSources: DomainSource[];
	domains: LoadedDomain[];
	domain: LoadedDomain;
}

export async function writeSyntheticInstallableDomainPackage(
	packageRoot: string,
	options: SyntheticInstallableDomainPackageOptions = {},
): Promise<SyntheticInstallableDomainPackageFixture> {
	const domainId = options.domainId ?? "synthetic";
	const packageName = options.packageName ?? `${domainId}-pkg`;
	const domainPath = options.domainPath ?? ".";
	const domainRoot =
		domainPath === "." ? packageRoot : join(packageRoot, domainPath);
	const manifest: PackageManifest = {
		name: packageName,
		version: "1.0.0",
		description: `Synthetic package ${packageName}`,
		domains: [{ name: domainId, path: domainPath }],
	};

	await mkdir(domainRoot, { recursive: true });
	await writeFile(
		join(packageRoot, "cosmonauts.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
		"utf-8",
	);
	await writeDomainManifest(domainRoot, {
		id: domainId,
		description: options.domainDescription ?? `Synthetic domain ${domainId}`,
		lead: options.lead,
		portable: options.portable,
		internal: options.internal,
	});
	await writeSyntheticAgents(domainRoot, domainId, options.agents ?? []);
	await writeMarkdownResourceDir(
		join(domainRoot, "prompts"),
		options.prompts ?? {},
	);
	await writeMarkdownResourceDir(
		join(domainRoot, "capabilities"),
		options.capabilities ?? {},
	);
	await writeSyntheticSkills(join(domainRoot, "skills"), options.skills ?? {});
	await writeSyntheticChains(domainRoot, options.chains ?? []);

	return { packageName, packageRoot, domainRoot, domainId, manifest };
}

export async function writeProjectInstalledSyntheticDomainPackage(
	projectRoot: string,
	options: SyntheticInstallableDomainPackageOptions = {},
): Promise<SyntheticInstallableDomainPackageFixture> {
	const domainId = options.domainId ?? "synthetic";
	const packageName = options.packageName ?? `${domainId}-pkg`;
	return writeSyntheticInstallableDomainPackage(
		join(projectRoot, ".cosmonauts", "packages", packageName),
		{ ...options, packageName, domainId },
	);
}

export async function loadProjectInstalledSyntheticDomainPackage(options: {
	projectRoot: string;
	builtinDomainsDir: string;
	package?: SyntheticInstallableDomainPackageOptions;
}): Promise<LoadedSyntheticProjectDomainPackageFixture> {
	const fixture = await writeProjectInstalledSyntheticDomainPackage(
		options.projectRoot,
		options.package,
	);
	const { scanDomainSources } = await import("../../lib/packages/scanner.ts");
	const { loadDomainsFromSources } = await import(
		"../../lib/domains/loader.ts"
	);
	const sources = await scanDomainSources({
		builtinDomainsDir: options.builtinDomainsDir,
		projectRoot: options.projectRoot,
	});
	const packageOrigin = `local:${fixture.packageName}`;
	const packageSources = sources.filter(
		(source) => source.origin === "builtin" || source.origin === packageOrigin,
	);
	const domains = await loadDomainsFromSources(packageSources, undefined, {
		activeDomainIds: [fixture.domainId],
	});
	const domain = domains.find(
		(candidate) => candidate.manifest.id === fixture.domainId,
	);

	if (!domain) {
		throw new Error(`Synthetic domain "${fixture.domainId}" was not loaded.`);
	}

	return { ...fixture, sources, packageSources, domains, domain };
}

async function writeDomainManifest(
	domainRoot: string,
	manifest: Record<string, unknown>,
): Promise<void> {
	await writeFile(
		join(domainRoot, "domain.ts"),
		`export const manifest = ${JSON.stringify(manifest, null, "\t")} as const;\nexport default manifest;\n`,
		"utf-8",
	);
}

async function writeSyntheticAgents(
	domainRoot: string,
	domainId: string,
	agents: readonly SyntheticDomainAgentFixture[],
): Promise<void> {
	if (agents.length === 0) return;

	const agentsDir = join(domainRoot, "agents");
	await mkdir(agentsDir, { recursive: true });

	for (const agent of agents) {
		const definition = {
			id: agent.id,
			description: agent.description ?? `Synthetic agent ${agent.id}`,
			capabilities: agent.capabilities ?? [],
			model: agent.model ?? "test/model",
			tools: agent.tools ?? "none",
			extensions: agent.extensions ?? [],
			skills: agent.skills ?? ["*"],
			subagents: agent.subagents,
			projectContext: agent.projectContext ?? false,
			session: agent.session ?? "ephemeral",
			loop: agent.loop ?? false,
			domain: domainId,
		};
		await writeFile(
			join(agentsDir, `${agent.id}.ts`),
			`const definition = ${JSON.stringify(definition, null, "\t")} as const;\nexport default definition;\n`,
			"utf-8",
		);
	}
}

async function writeMarkdownResourceDir(
	dir: string,
	resources: Record<string, string>,
): Promise<void> {
	const entries = Object.entries(resources);
	if (entries.length === 0) return;

	await mkdir(dir, { recursive: true });
	for (const [name, content] of entries) {
		await writeFile(join(dir, `${name}.md`), content, "utf-8");
	}
}

async function writeSyntheticSkills(
	skillsDir: string,
	skills: Record<string, string>,
): Promise<void> {
	const entries = Object.entries(skills);
	if (entries.length === 0) return;

	for (const [name, content] of entries) {
		const skillDir = join(skillsDir, name);
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
	}
}

async function writeSyntheticChains(
	domainRoot: string,
	chains: readonly NamedChain[],
): Promise<void> {
	if (chains.length === 0) return;

	await writeFile(
		join(domainRoot, "chains.ts"),
		`const chains = ${JSON.stringify(chains, null, "\t")} as const;\nexport default chains;\n`,
		"utf-8",
	);
}
