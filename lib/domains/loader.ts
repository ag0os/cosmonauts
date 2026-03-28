/**
 * Dynamic domain discovery and loading.
 *
 * Scans a domains directory for subdirectories containing domain.ts manifests,
 * imports their agent definitions, and indexes their resources (capabilities,
 * prompts, skills, extensions, workflows).
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentDefinition } from "../agents/types.ts";
import type { WorkflowDefinition } from "../workflows/types.ts";
import type {
	DomainManifest,
	DomainMergeConflict,
	DomainSource,
	LoadedDomain,
	MergeStrategy,
} from "./types.ts";

/**
 * Load all domains from a domains directory.
 *
 * Scans for subdirectories containing a `domain.ts` manifest file,
 * imports manifests and agent definitions, and indexes all resources.
 * The `shared` domain is always loaded first, then remaining domains
 * in alphabetical order.
 */
export async function loadDomains(domainsDir: string): Promise<LoadedDomain[]> {
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

		const domain = await loadSingleDomain(domainDir);
		domains.push(domain);
	}
	return domains;
}

/**
 * Load a single domain from its root directory.
 */
async function loadSingleDomain(domainDir: string): Promise<LoadedDomain> {
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
			const def: AgentDefinition = mod.default;
			if (def?.id) {
				def.domain = manifest.id;
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

	// Load workflows if present
	let workflows: WorkflowDefinition[] = [];
	const workflowsPath = join(domainDir, "workflows.ts");
	if (await fileExists(workflowsPath)) {
		const mod = await import(workflowsPath);
		workflows = mod.default ?? mod.workflows ?? [];
	}

	return {
		manifest,
		portable: manifest.portable ?? false,
		agents,
		capabilities,
		prompts,
		skills,
		extensions,
		workflows,
		rootDirs: [domainDir],
	};
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
export async function loadDomainsFromSources(
	sources: DomainSource[],
	mergeStrategy?: MergeStrategy,
): Promise<LoadedDomain[]> {
	const strategy = mergeStrategy ?? defaultMergeStrategy;

	// Process lowest-precedence sources first so higher-precedence sources
	// arrive as "incoming" and win on conflicts.
	const sorted = [...sources].sort((a, b) => a.precedence - b.precedence);

	const accumulated = new Map<string, LoadedDomain>();

	for (const source of sorted) {
		const domains = await loadDomains(source.domainsDir);
		for (const domain of domains) {
			const id = domain.manifest.id;
			const existing = accumulated.get(id);

			if (!existing) {
				accumulated.set(id, domain);
				continue;
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
		workflows: [...incoming.workflows, ...existing.workflows],
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
