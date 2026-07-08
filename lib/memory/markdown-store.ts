import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import matter from "gray-matter";
import type {
	MemoryQuery,
	MemoryRetrieveResult,
	MemoryScopeContext,
	MemoryScopeName,
	MemoryStore,
	MemoryWarning,
	RetrievedMemoryRecord,
} from "./types.ts";

const RECORDS_DIR = "records";

export interface MarkdownMemoryStoreOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
	readonly now?: () => Date;
}

export function createMarkdownMemoryStore(
	options: MarkdownMemoryStoreOptions,
): MemoryStore {
	const projectRoot = options.projectRoot;
	const userCosmonautsRoot =
		options.userCosmonautsRoot ?? join(homedir(), ".cosmonauts");
	const now = options.now ?? (() => new Date());

	return {
		async write(record) {
			const timestamp = record.timestamp ?? now().toISOString();
			const path = recordPath({
				projectRoot,
				userCosmonautsRoot,
				scope: record.scope,
				title: record.title,
				timestamp,
			});
			if (!path) {
				return {
					kind: "unsupported",
					reason:
						"Session-scoped markdown memory is skipped in W1; Pi session state owns short-term continuity.",
				};
			}

			try {
				await mkdir(join(path.storeRoot, RECORDS_DIR), { recursive: true });
				const resource = relative(path.storeRoot, path.absolutePath);
				const frontmatter = {
					type: record.type,
					title: record.title,
					description: record.description,
					resource,
					tags: [...record.tags],
					timestamp,
					scope: record.scope,
					kind: record.kind,
					...(record.source ? { source: record.source } : {}),
				};
				await writeFile(
					path.absolutePath,
					matter.stringify(record.content, frontmatter),
					"utf-8",
				);
				return {
					kind: "written",
					path: path.absolutePath,
					record: {
						type: record.type,
						scope: record.scope,
						kind: record.kind,
						title: record.title,
						description: record.description,
						resource,
						tags: record.tags,
						timestamp,
						content: record.content,
						path: path.absolutePath,
					},
				};
			} catch (error: unknown) {
				return {
					kind: "failed",
					path: path.absolutePath,
					reason: error instanceof Error ? error.message : String(error),
				};
			}
		},

		async retrieve(scope, query) {
			return retrieveMarkdownRecords({
				projectRoot,
				userCosmonautsRoot,
				scope,
				query,
			});
		},

		async consolidate() {
			return {
				kind: "noop",
				reason:
					"W1 performs no background memory consolidation, pruning, decay, or dreaming.",
			};
		},
	};
}

async function retrieveMarkdownRecords(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: MemoryScopeContext;
	readonly query: MemoryQuery;
}): Promise<MemoryRetrieveResult> {
	const searchedScopes: MemoryScopeName[] = [];
	const skippedScopes = [];
	const warnings: MemoryWarning[] = [];
	const records: RetrievedMemoryRecord[] = [];

	for (const scope of options.scope.scopes) {
		if (scope === "session") {
			skippedScopes.push({
				scope,
				reason:
					"Session-scoped markdown memory is skipped in W1; Pi session state owns short-term continuity.",
			});
			continue;
		}

		searchedScopes.push(scope);
		const storeRoot = memoryRoot({
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
			scope,
		});
		const files = await listMarkdownFiles(join(storeRoot, RECORDS_DIR));
		for (const file of files) {
			const record = await parseMarkdownRecord({
				path: file,
				storeRoot,
				expectedScope: scope,
				warnings,
			});
			if (!record || !matchesQuery(record, options.query)) continue;
			records.push(record);
		}
	}

	records.sort(
		(a, b) =>
			b.timestamp.localeCompare(a.timestamp) || a.path.localeCompare(b.path),
	);

	return {
		records:
			options.query.limit === undefined
				? records
				: records.slice(0, options.query.limit),
		searchedScopes,
		skippedScopes,
		warnings,
	};
}

async function parseMarkdownRecord(options: {
	readonly path: string;
	readonly storeRoot: string;
	readonly expectedScope: MemoryScopeName;
	readonly warnings: MemoryWarning[];
}): Promise<RetrievedMemoryRecord | undefined> {
	try {
		const parsed = matter(await readFile(options.path, "utf-8"));
		const data = parsed.data;
		const scope = data.scope;
		if (scope !== options.expectedScope) {
			options.warnings.push({
				path: options.path,
				message: `Memory record scope ${String(scope)} does not match ${options.expectedScope} store.`,
			});
			return undefined;
		}
		if (
			typeof data.type !== "string" ||
			typeof data.title !== "string" ||
			typeof data.description !== "string" ||
			typeof data.resource !== "string" ||
			typeof data.timestamp !== "string"
		) {
			options.warnings.push({
				path: options.path,
				message: "Memory record is missing required OKF frontmatter.",
			});
			return undefined;
		}
		return {
			type: data.type,
			scope,
			kind:
				data.kind === "semantic" ||
				data.kind === "procedural" ||
				data.kind === "episodic"
					? data.kind
					: undefined,
			title: data.title,
			description: data.description,
			resource: data.resource,
			tags: Array.isArray(data.tags)
				? data.tags.filter((tag): tag is string => typeof tag === "string")
				: [],
			timestamp: data.timestamp,
			content: parsed.content.trim(),
			path: options.path,
		};
	} catch (error: unknown) {
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const files: string[] = [];
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await listMarkdownFiles(path)));
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				files.push(path);
			}
		}
		return files.sort();
	} catch (error: unknown) {
		if (isMissingFile(error)) return [];
		throw error;
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
	if (query.resource && query.resource !== record.resource) return false;
	const text = query.text?.trim().toLowerCase();
	if (!text) return true;
	return [
		record.title,
		record.description,
		record.content,
		record.resource,
		record.tags.join(" "),
	]
		.join("\n")
		.toLowerCase()
		.includes(text);
}

function recordPath(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: MemoryScopeName;
	readonly title: string;
	readonly timestamp: string;
}): { readonly storeRoot: string; readonly absolutePath: string } | undefined {
	const scope = options.scope;
	if (scope === "session") return undefined;
	const storeRoot = memoryRoot({ ...options, scope });
	const slug = slugify(`${options.timestamp}-${options.title}`);
	return {
		storeRoot,
		absolutePath: join(storeRoot, RECORDS_DIR, `${slug}.md`),
	};
}

function memoryRoot(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
}): string {
	return options.scope === "project"
		? join(options.projectRoot, "memory")
		: join(options.userCosmonautsRoot, "memory");
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "memory-record";
}

function isMissingFile(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}
