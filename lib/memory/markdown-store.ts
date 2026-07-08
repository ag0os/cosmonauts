import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
	type AuthoredNoteInput,
	parseAuthoredNote,
	renderAuthoredNote,
} from "./okf.ts";
import {
	AGENT_MEMORY_INDEX_RESOURCE,
	assertBoundProjectRoot,
	noteResource,
	resolveAgentMemoryStorePaths,
} from "./paths.ts";
import type {
	MemoryQuery,
	MemoryRecordDraft,
	MemoryRetrieveResult,
	MemoryScopeContext,
	MemoryScopeName,
	MemoryStore,
	MemoryWarning,
	RetrievedMemoryRecord,
} from "./types.ts";

const NOOP_REASON =
	"W1 performs no background memory consolidation, pruning, decay, or dreaming.";
const SESSION_SKIPPED_REASON =
	"Session-scoped markdown memory is not built in W1; Pi session state and compaction cover short-term memory.";

export interface MarkdownMemoryStoreOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
	readonly now?: () => Date;
}

export function createMarkdownMemoryStore(
	options: MarkdownMemoryStoreOptions,
): MemoryStore {
	const projectRoot = resolve(options.projectRoot);
	const userCosmonautsRoot = resolve(
		options.userCosmonautsRoot ?? join(homedir(), ".cosmonauts"),
	);
	const now = options.now ?? (() => new Date());

	return {
		async write(record) {
			if (record.type !== "note") {
				return {
					kind: "unsupported",
					reason: 'Markdown memory authored records must use type "note".',
				};
			}
			if (record.scope === "session") {
				return {
					kind: "unsupported",
					reason: SESSION_SKIPPED_REASON,
				};
			}

			const timestamp = record.timestamp ?? now().toISOString();
			const fileName = noteFileName({ record, timestamp });
			const resource = noteResource(fileName);
			const paths = resolveAgentMemoryStorePaths({
				projectRoot,
				userCosmonautsRoot,
				scope: record.scope,
			});
			const path = join(paths.root, resource);
			const note: AuthoredNoteInput = {
				title: record.title,
				description: record.description,
				resource,
				tags: record.tags,
				timestamp,
				scope: record.scope,
				kind: record.kind,
				source: record.source,
				content: record.content,
			};
			const rendered = renderAuthoredNote(note);
			let existing: string | undefined;

			try {
				existing = await readFileIfExists(path);
				await mkdir(paths.notesDir, { recursive: true });
				await writeFileIfChanged(path, rendered, existing);
				await regenerateIndex({
					projectRoot,
					userCosmonautsRoot,
					scope: record.scope,
				});
				return {
					kind: "written",
					path,
					record: toRetrievedRecord({ note, path }),
				};
			} catch (error: unknown) {
				if (existing === undefined) await unlink(path).catch(() => undefined);
				return {
					kind: "failed",
					path,
					reason: error instanceof Error ? error.message : String(error),
				};
			}
		},

		async retrieve(scope, query) {
			assertBoundProjectRoot({
				boundProjectRoot: projectRoot,
				requestedProjectRoot: scope.projectRoot,
			});
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
				reason: NOOP_REASON,
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
				reason: SESSION_SKIPPED_REASON,
			});
			continue;
		}

		searchedScopes.push(scope);
		const storePaths = resolveAgentMemoryStorePaths({
			projectRoot: options.projectRoot,
			userCosmonautsRoot: options.userCosmonautsRoot,
			scope,
		});
		const scopeRecords = await readStoreRecords({
			storePaths,
			warnings,
		});
		for (const record of scopeRecords) {
			if (matchesQuery(record, options.query)) records.push(record);
		}
	}

	sortRecords(records);

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

async function readStoreRecords(options: {
	readonly storePaths: ReturnType<typeof resolveAgentMemoryStorePaths>;
	readonly warnings: MemoryWarning[];
}): Promise<RetrievedMemoryRecord[]> {
	const files = await listMarkdownFiles(options.storePaths.notesDir);
	const records: RetrievedMemoryRecord[] = [];
	for (const file of files) {
		const record = await parseMarkdownRecord({
			path: file,
			expectedScope: options.storePaths.scope,
			warnings: options.warnings,
		});
		if (record) records.push(record);
	}
	return records;
}

async function parseMarkdownRecord(options: {
	readonly path: string;
	readonly expectedScope: Exclude<MemoryScopeName, "session">;
	readonly warnings: MemoryWarning[];
}): Promise<RetrievedMemoryRecord | undefined> {
	try {
		const parsed = parseAuthoredNote({
			raw: await readFile(options.path, "utf-8"),
			expectedScope: options.expectedScope,
		});
		if (!parsed.ok) {
			options.warnings.push({
				path: options.path,
				message: parsed.message,
			});
			return undefined;
		}
		return toRetrievedRecord({ note: parsed.record, path: options.path });
	} catch (error: unknown) {
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

async function regenerateIndex(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: Exclude<MemoryScopeName, "session">;
}): Promise<void> {
	const storePaths = resolveAgentMemoryStorePaths(options);
	const records = await readStoreRecords({
		storePaths,
		warnings: [],
	});
	sortRecords(records);
	await writeFileIfChanged(storePaths.indexPath, renderIndex({ records }));
}

function renderIndex(options: {
	readonly records: readonly RetrievedMemoryRecord[];
}): string {
	const lines = [
		"---",
		"type: note-index",
		`resource: ${AGENT_MEMORY_INDEX_RESOURCE}`,
		"---",
		"",
		"# Agent Memory Index",
		"",
	];

	if (options.records.length === 0) {
		lines.push("No valid authored notes.");
	} else {
		for (const record of options.records) {
			const tags =
				record.tags.length > 0 ? ` tags: ${record.tags.join(", ")}` : "";
			lines.push(
				`- ${record.timestamp} [${record.scope}/${record.kind ?? "unknown"}] ${record.title} (${record.resource})${tags}`,
			);
			if (record.description) lines.push(`  ${record.description}`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (isMissingFile(error)) return [];
		throw error;
	}

	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listMarkdownFiles(path)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			entry.name !== "index.md"
		) {
			files.push(path);
		}
	}
	return files.sort();
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

function sortRecords(records: RetrievedMemoryRecord[]): void {
	records.sort(
		(a, b) =>
			b.timestamp.localeCompare(a.timestamp) || a.path.localeCompare(b.path),
	);
}

async function writeFileIfChanged(
	path: string,
	content: string,
	existing?: string,
): Promise<void> {
	const previous = existing ?? (await readFileIfExists(path));
	if (previous === content) return;
	await mkdir(dirname(path), { recursive: true });
	const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	try {
		await writeFile(tempPath, content, "utf-8");
		await rename(tempPath, path);
	} catch (error) {
		await unlink(tempPath).catch(() => undefined);
		throw error;
	}
}

async function readFileIfExists(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

function toRetrievedRecord(options: {
	readonly note: AuthoredNoteInput;
	readonly path: string;
}): RetrievedMemoryRecord {
	return {
		type: "note",
		scope: options.note.scope,
		kind: options.note.kind,
		title: options.note.title,
		description: options.note.description,
		resource: options.note.resource,
		tags: options.note.tags,
		timestamp: options.note.timestamp,
		content: options.note.content,
		path: options.path,
	};
}

function noteFileName(options: {
	readonly record: MemoryRecordDraft;
	readonly timestamp: string;
}): string {
	const slug = slugify(options.record.title);
	const hash = createHash("sha256")
		.update(
			JSON.stringify({
				type: "note",
				title: options.record.title,
				description: options.record.description,
				content: options.record.content,
				tags: options.record.tags,
				timestamp: options.timestamp,
				scope: options.record.scope,
				kind: options.record.kind,
				source: options.record.source,
			}),
		)
		.digest("hex")
		.slice(0, 8);
	return `${timestampForFile(options.timestamp)}-${slug}-${hash}.md`;
}

function timestampForFile(timestamp: string): string {
	const parsed = new Date(timestamp);
	if (Number.isNaN(parsed.valueOf())) return slugify(timestamp);
	return parsed.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
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
