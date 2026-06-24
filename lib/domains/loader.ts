/**
 * Dynamic domain discovery and loading.
 *
 * Scans a domains directory for subdirectories containing domain.ts manifests,
 * imports their agent definitions, and indexes their resources (capabilities,
 * prompts, skills, extensions, named chains).
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDefinition } from "../agents/types.ts";
import type { NamedChain } from "../chains/types.ts";
import type {
	DomainManifest,
	DomainMergeConflict,
	DomainProvenance,
	DomainSource,
	DomainSourceKind,
	LoadedDomain,
	MergeStrategy,
} from "./types.ts";

interface LoadDomainsFromSourcesOptions {
	/**
	 * Domain ids allowed to participate in active runtime loading. When omitted,
	 * every loaded provider participates. Include "shared" in this set when shared
	 * should remain active.
	 */
	readonly activeDomainIds?: ReadonlySet<string> | readonly string[];
}

export class DomainIdConflictError extends Error {
	readonly domainId: string;
	readonly existing: DomainProvenance;
	readonly incoming: DomainProvenance;

	constructor(options: {
		domainId: string;
		existing: DomainProvenance;
		incoming: DomainProvenance;
	}) {
		super(
			`Domain id conflict for "${options.domainId}" at precedence ${options.incoming.precedence}: ${options.existing.origin} and ${options.incoming.origin} both provide an active domain with that id.`,
		);
		this.name = "DomainIdConflictError";
		this.domainId = options.domainId;
		this.existing = options.existing;
		this.incoming = options.incoming;
	}
}

/**
 * Load all domains from a domains directory.
 *
 * Scans for subdirectories containing a `domain.ts` manifest file,
 * imports manifests and agent definitions, and indexes all resources.
 * The `shared` domain is always loaded first, then remaining domains
 * in alphabetical order.
 */
export async function loadDomains(domainsDir: string): Promise<LoadedDomain[]> {
	return loadDomainsInDir(domainsDir, {
		origin: domainsDir,
		precedence: 0,
		kind: "domains-dir",
	});
}

async function loadDomainsInDir(
	domainsDir: string,
	source: Omit<DomainProvenance, "rootDir">,
): Promise<LoadedDomain[]> {
	const entries = await readdir(domainsDir, { withFileTypes: true });
	const domainDirs = entries
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort((a, b) => {
			if (a === "shared") return -1;
			if (b === "shared") return 1;
			return a.localeCompare(b);
		});

	const domains: LoadedDomain[] = [];
	for (const dirName of domainDirs) {
		const domainDir = join(domainsDir, dirName);
		if (!(await fileExists(join(domainDir, "domain.ts")))) continue;

		const domain = await loadSingleDomain(domainDir, {
			...source,
			rootDir: domainDir,
		});
		domains.push(domain);
	}
	return domains;
}

/**
 * Load a single domain from its root directory.
 */
async function loadSingleDomain(
	domainDir: string,
	provenance: DomainProvenance,
): Promise<LoadedDomain> {
	// Import manifest (supports both default and named `manifest` export)
	const manifestModule = await import(join(domainDir, "domain.ts"));
	const manifest: DomainManifest =
		manifestModule.default ?? manifestModule.manifest;

	// Load agent definitions from agents/*.ts
	const agents = new Map<string, AgentDefinition>();
	const agentsDir = join(domainDir, "agents");
	if (await dirExists(agentsDir)) {
		const agentFiles = await readdir(agentsDir);
		for (const file of agentFiles) {
			if (!file.endsWith(".ts") || file.startsWith(".")) continue;
			const mod = await import(join(agentsDir, file));
			const def = normalizeAgentDefinition(mod.default, manifest.id);
			if (def) {
				agents.set(def.id, def);
			}
		}
	}

	// Index resources
	const capabilities = await indexMarkdownFiles(
		join(domainDir, "capabilities"),
	);
	const prompts = await indexMarkdownFiles(join(domainDir, "prompts"));
	const skills = await indexSubdirectories(join(domainDir, "skills"));
	const extensions = await indexSubdirectories(join(domainDir, "extensions"));

	// Load named chains if present
	let chains: NamedChain[] = [];
	const chainsPath = join(domainDir, "chains.ts");
	if (await fileExists(chainsPath)) {
		const mod = await import(chainsPath);
		chains = mod.default ?? mod.chains ?? [];
	}

	return {
		manifest,
		portable: manifest.portable ?? false,
		agents,
		capabilities,
		prompts,
		skills,
		extensions,
		chains,
		provenance: [provenance],
		rootDirs: [domainDir],
	};
}

function normalizeAgentDefinition(
	definition: unknown,
	domainId: string,
): AgentDefinition | undefined {
	if (!definition || typeof definition !== "object") return undefined;
	if (!("id" in definition) || typeof definition.id !== "string") {
		return undefined;
	}

	const normalized = {
		...definition,
		domain: domainId,
		skills:
			"skills" in definition && definition.skills !== undefined
				? definition.skills
				: ["*"],
	};

	return normalized as AgentDefinition;
}

// ============================================================================
// Multi-source loading
// ============================================================================

/** Default merge strategy: union of resources, incoming (higher precedence) wins on key conflicts. */
const defaultMergeStrategy: MergeStrategy = () => "merge";

/**
 * Load domains from multiple sources and return a unified list.
 *
 * Sources are processed in ascending precedence order so that higher-precedence
 * sources override lower-precedence ones. When the same domain ID appears in
 * multiple sources, the mergeStrategy callback (default: merge) decides how to
 * resolve the conflict.
 *
 * The returned list preserves the "shared first, then alphabetical" ordering
 * convention established by loadDomains().
 */
// fallow-ignore-next-line complexity
export async function loadDomainsFromSources(
	sources: DomainSource[],
	mergeStrategy?: MergeStrategy,
	options: LoadDomainsFromSourcesOptions = {},
): Promise<LoadedDomain[]> {
	const strategy = mergeStrategy ?? defaultMergeStrategy;
	const activeDomainIds = normalizeActiveDomainIds(options.activeDomainIds);

	// Process lowest-precedence sources first so higher-precedence sources
	// arrive as "incoming" and win on conflicts.
	const sorted = [...sources].sort((a, b) => a.precedence - b.precedence);

	const accumulated = new Map<string, LoadedDomain>();

	for (const source of sorted) {
		const kind = sourceKind(source);
		const sourceProvenance = {
			origin: source.origin,
			precedence: source.precedence,
			kind,
		};
		const domains =
			kind === "domain-root"
				? await loadDomainRoot(source.domainsDir, sourceProvenance)
				: await loadDomainsInDir(source.domainsDir, sourceProvenance);
		for (const domain of domains) {
			const id = domain.manifest.id;
			if (activeDomainIds && !activeDomainIds.has(id)) {
				continue;
			}

			const existing = accumulated.get(id);

			if (!existing) {
				accumulated.set(id, domain);
				continue;
			}

			const incomingProvenance = firstProvenance(domain);
			const samePrecedenceProvider = existing.provenance.find(
				(provenance) => provenance.precedence === incomingProvenance.precedence,
			);
			if (samePrecedenceProvider) {
				throw new DomainIdConflictError({
					domainId: id,
					existing: samePrecedenceProvider,
					incoming: incomingProvenance,
				});
			}

			const conflict: DomainMergeConflict = {
				domainId: id,
				existing,
				incoming: domain,
				overlapping: {
					agents: [...domain.agents.keys()].filter((k) =>
						existing.agents.has(k),
					),
					capabilities: [...domain.capabilities].filter((k) =>
						existing.capabilities.has(k),
					),
					skills: [...domain.skills].filter((k) => existing.skills.has(k)),
					extensions: [...domain.extensions].filter((k) =>
						existing.extensions.has(k),
					),
					prompts: [...domain.prompts].filter((k) => existing.prompts.has(k)),
				},
			};

			const action = strategy(conflict);

			if (action === "skip") {
			} else if (action === "replace") {
				// Incoming domain completely replaces the existing one.
				accumulated.set(id, domain);
			} else {
				// merge: union resources; incoming (higher precedence) wins on key conflicts.
				accumulated.set(id, mergeDomains(existing, domain));
			}
		}
	}

	// Re-sort: shared first, then alphabetical — matching loadDomains() convention.
	return [...accumulated.values()].sort((a, b) => {
		const aId = a.manifest.id;
		const bId = b.manifest.id;
		if (aId === "shared") return -1;
		if (bId === "shared") return 1;
		return aId.localeCompare(bId);
	});
}

function normalizeActiveDomainIds(
	activeDomainIds: LoadDomainsFromSourcesOptions["activeDomainIds"],
): ReadonlySet<string> | undefined {
	if (activeDomainIds === undefined) return undefined;
	return activeDomainIds instanceof Set
		? activeDomainIds
		: new Set(activeDomainIds);
}

function sourceKind(source: DomainSource): DomainSourceKind {
	return source.kind ?? source.sourceType ?? "domains-dir";
}

async function loadDomainRoot(
	domainDir: string,
	source: Omit<DomainProvenance, "rootDir">,
): Promise<LoadedDomain[]> {
	if (!(await fileExists(join(domainDir, "domain.ts")))) return [];
	return [
		await loadSingleDomain(domainDir, {
			...source,
			rootDir: domainDir,
		}),
	];
}

function firstProvenance(domain: LoadedDomain): DomainProvenance {
	const provenance = domain.provenance[0];
	if (!provenance) {
		return {
			origin: domain.rootDirs[0] ?? domain.manifest.id,
			precedence: 0,
			kind: "domains-dir",
			rootDir: domain.rootDirs[0] ?? "",
		};
	}
	return provenance;
}

/**
 * Merge two domains with the same ID.
 * incoming has higher precedence: its agents, manifest, and portable flag take priority.
 * rootDirs are ordered with incoming's dirs first (highest precedence).
 */
function mergeDomains(
	existing: LoadedDomain,
	incoming: LoadedDomain,
): LoadedDomain {
	// Agents: start from existing, then overwrite with incoming (incoming wins on conflict)
	const mergedAgents = new Map(existing.agents);
	for (const [id, def] of incoming.agents) {
		mergedAgents.set(id, def);
	}

	return {
		manifest: incoming.manifest,
		portable: incoming.portable,
		agents: mergedAgents,
		capabilities: new Set([...existing.capabilities, ...incoming.capabilities]),
		prompts: new Set([...existing.prompts, ...incoming.prompts]),
		skills: new Set([...existing.skills, ...incoming.skills]),
		extensions: new Set([...existing.extensions, ...incoming.extensions]),
		// Existing (lower-precedence) first so that incoming (higher-precedence)
		// overwrites by name when consumers fold into a Map.
		chains: [...existing.chains, ...incoming.chains],
		provenance: [...incoming.provenance, ...existing.provenance],
		// Incoming dirs first — higher precedence for file resolution.
		rootDirs: [...incoming.rootDirs, ...existing.rootDirs],
	};
}

// ============================================================================
// Helpers
// ============================================================================

/** Check if a file exists. */
async function fileExists(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isFile();
	} catch {
		return false;
	}
}

/** Check if a directory exists. */
async function dirExists(path: string): Promise<boolean> {
	try {
		const s = await stat(path);
		return s.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Index markdown files in a directory, returning a Set of names
 * with the .md extension stripped. Non-recursive — only top-level .md files.
 */
async function indexMarkdownFiles(dirPath: string): Promise<Set<string>> {
	const names = new Set<string>();
	if (!(await dirExists(dirPath))) return names;

	const entries = await readdir(dirPath);
	for (const entry of entries) {
		if (entry.endsWith(".md")) {
			names.add(entry.slice(0, -3));
		}
	}
	return names;
}

/**
 * Index subdirectories in a directory, returning a Set of directory names.
 */
async function indexSubdirectories(dirPath: string): Promise<Set<string>> {
	const names = new Set<string>();
	if (!(await dirExists(dirPath))) return names;

	const entries = await readdir(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			names.add(entry.name);
		}
	}
	return names;
}
