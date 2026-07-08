import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import type {
	MemoryQuery,
	MemoryRecordDraft,
	MemoryRetrieveResult,
	MemoryScopeContext,
	MemoryStore,
	MemoryWriteResult,
	RetrievedMemoryRecord,
} from "../memory/index.ts";
import type { ArchitectureMapFreshness } from "./types.ts";

const ARCHITECTURE_DIR = "memory/architecture";
const INDEX_PATH = "index.md";
const NOOP_REASON =
	"W1 performs no background memory consolidation, pruning, decay, or dreaming.";

export interface ArchitectureMapMemoryStoreOptions {
	readonly projectRoot: string;
	readonly freshness: ArchitectureMapFreshness;
}

export function createArchitectureMapMemoryStore(
	options: ArchitectureMapMemoryStoreOptions,
): MemoryStore {
	return {
		async write(_record: MemoryRecordDraft): Promise<MemoryWriteResult> {
			return {
				kind: "unsupported",
				reason:
					"Architecture-map memory is generated derived state; writes remain owned by generateArchitectureMap.",
			};
		},

		async retrieve(
			scope: MemoryScopeContext,
			query: MemoryQuery,
		): Promise<MemoryRetrieveResult> {
			return retrieveArchitectureMap({
				projectRoot: options.projectRoot,
				freshness: options.freshness,
				scope,
				query,
			});
		},

		async consolidate() {
			return {
				kind: "noop",
				reason: NOOP_REASON,
			};
		},
	};
}

async function retrieveArchitectureMap(options: {
	readonly projectRoot: string;
	readonly freshness: ArchitectureMapFreshness;
	readonly scope: MemoryScopeContext;
	readonly query: MemoryQuery;
}): Promise<MemoryRetrieveResult> {
	const projectRequested = options.scope.scopes.includes("project");
	const skippedScopes = options.scope.scopes
		.filter((scope) => scope !== "project")
		.map((scope) => ({
			scope,
			reason: "Architecture-map memory is project-scoped generated state.",
		}));
	if (!projectRequested) {
		return {
			records: [],
			searchedScopes: [],
			skippedScopes,
			warnings: [],
			details: { freshness: options.freshness },
		};
	}

	const resource = normalizeResource(options.query.resource);
	const record = resource
		? await readShardRecord({
				projectRoot: options.projectRoot,
				resource,
				freshness: options.freshness,
			})
		: await readIndexRecord({
				projectRoot: options.projectRoot,
				freshness: options.freshness,
			});

	return {
		records:
			record && matchesQuery(record, options.query)
				? [record].slice(0, options.query.limit ?? 1)
				: [],
		searchedScopes: ["project"],
		skippedScopes,
		warnings: [],
		details: { freshness: options.freshness, resource },
	};
}

async function readIndexRecord(options: {
	readonly projectRoot: string;
	readonly freshness: ArchitectureMapFreshness;
}): Promise<RetrievedMemoryRecord | undefined> {
	const path = architecturePath(options.projectRoot, INDEX_PATH);
	const raw = await readMapFile(path);
	if (raw === undefined) return undefined;
	const parsed = matter(raw);
	const timestamp =
		typeof parsed.data.timestamp === "string"
			? parsed.data.timestamp
			: "1970-01-01T00:00:00.000Z";
	return {
		type: "code-structure-index",
		scope: "project",
		kind: "semantic",
		title: "Architecture Map",
		description: "Generated architecture-map index.",
		resource: "memory/architecture/index.md",
		tags: [],
		timestamp,
		content: [formatFreshnessBanner(options.freshness), raw].join("\n\n"),
		path,
	};
}

async function readShardRecord(options: {
	readonly projectRoot: string;
	readonly resource: string;
	readonly freshness: ArchitectureMapFreshness;
}): Promise<RetrievedMemoryRecord | undefined> {
	if (!validateResource(options.resource).ok) return undefined;
	const shardPath = resourceToShardPath(options.resource);
	const absoluteShardPath = safeArchitecturePath(
		options.projectRoot,
		shardPath,
	);
	if (!absoluteShardPath) return undefined;
	const raw = await readMapFile(absoluteShardPath);
	if (raw === undefined) return undefined;
	const parsed = matter(raw);
	if (parsed.data.resource !== options.resource) return undefined;
	const timestamp =
		typeof parsed.data.timestamp === "string"
			? parsed.data.timestamp
			: "1970-01-01T00:00:00.000Z";
	return {
		type: "code-structure-module",
		scope: "project",
		kind: "semantic",
		title: options.resource,
		description: `Generated architecture-map shard for ${options.resource}.`,
		resource: options.resource,
		tags: [],
		timestamp,
		content: [formatFreshnessBanner(options.freshness), raw].join("\n\n"),
		path: join(options.projectRoot, ARCHITECTURE_DIR, shardPath),
	};
}

export async function listArchitectureMapModules(
	projectRoot: string,
): Promise<string[]> {
	const modulesRoot = safeArchitecturePath(projectRoot, "modules");
	if (!modulesRoot) return [];
	const modules = new Set<string>();
	await collectModuleResources(modulesRoot, modules);
	return [...modules].sort();
}

async function collectModuleResources(
	directory: string,
	modules: Set<string>,
): Promise<void> {
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (isMissingFile(error)) return;
		throw error;
	}

	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await collectModuleResources(path, modules);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const file = await readMapFile(path);
		if (!file) continue;
		const resource = matter(file).data.resource;
		if (typeof resource === "string" && validateResource(resource).ok) {
			modules.add(resource);
		}
	}
}

function matchesQuery(
	record: RetrievedMemoryRecord,
	query: MemoryQuery,
): boolean {
	if (
		query.recordTypes &&
		query.recordTypes.length > 0 &&
		!query.recordTypes.includes(record.type)
	) {
		return false;
	}
	const text = query.text?.trim().toLowerCase();
	if (!text) return true;
	return [record.title, record.description, record.resource, record.content]
		.join("\n")
		.toLowerCase()
		.includes(text);
}

function normalizeResource(value: string | undefined): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function resourceToShardPath(resource: string): string {
	const normalizedResource = resource === "." ? "root" : resource;
	return `modules/${normalizedResource}.md`;
}

function validateResource(
	resource: string,
): { readonly ok: true } | { readonly ok: false } {
	if (
		resource.length === 0 ||
		resource.includes("\\") ||
		isAbsolute(resource)
	) {
		return { ok: false };
	}
	const segments = resource.split("/");
	if (segments.some((segment) => segment === "" || segment === "..")) {
		return { ok: false };
	}
	return { ok: true };
}

function safeArchitecturePath(
	projectRoot: string,
	pathInArchitectureDir: string,
): string | undefined {
	const root = resolve(projectRoot, ARCHITECTURE_DIR);
	const absolute = resolve(root, pathInArchitectureDir);
	const rel = relative(root, absolute);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
	return absolute;
}

function architecturePath(
	projectRoot: string,
	pathInArchitectureDir: string,
): string {
	return join(projectRoot, ARCHITECTURE_DIR, pathInArchitectureDir);
}

async function readMapFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

function formatFreshnessBanner(freshness: ArchitectureMapFreshness): string {
	switch (freshness.kind) {
		case "current":
			return `Architecture map freshness: current (${freshness.hash})`;
		case "stale":
			return `Architecture map freshness: stale (recorded ${freshness.oldHash}, current ${freshness.newHash})`;
		case "missing":
			return "Architecture map freshness: missing";
	}
}

function isMissingFile(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
