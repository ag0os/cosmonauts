import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
	link,
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
	canonicalizePlaybookName,
	PROFILE_DESCRIPTION,
	PROFILE_TITLE,
	PROFILE_WRITE_MAX_BYTES,
} from "./authored-records.ts";
import {
	type AuthoredNoteInput,
	type AuthoredPlaybookInput,
	type AuthoredProfileInput,
	type AuthoredRecordInput,
	type EpisodeRecordInput,
	parseAuthoredRecord,
	parseEpisodeOkfRecord,
	renderAuthoredRecord,
	renderEpisodeRecord,
} from "./okf.ts";
import {
	AGENT_MEMORY_INDEX_RESOURCE,
	AGENT_MEMORY_PROFILE_RESOURCE,
	assertBoundProjectRoot,
	episodeResource,
	noteResource,
	playbookResource,
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
	MemoryWriteResult,
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
	readonly episodeWarningThreshold?: number;
}

interface MarkdownStoreContext {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly now: () => Date;
	readonly episodeWarningThreshold: number;
}

type DurableScope = Exclude<MemoryScopeName, "session">;

export function createMarkdownMemoryStore(
	options: MarkdownMemoryStoreOptions,
): MemoryStore {
	const context: MarkdownStoreContext = {
		projectRoot: resolve(options.projectRoot),
		userCosmonautsRoot: resolve(
			options.userCosmonautsRoot ?? join(homedir(), ".cosmonauts"),
		),
		now: options.now ?? (() => new Date()),
		episodeWarningThreshold: options.episodeWarningThreshold ?? 500,
	};

	return {
		async write(record) {
			if (record.scope === "session") {
				return {
					kind: "unsupported",
					reason: SESSION_SKIPPED_REASON,
				};
			}

			switch (record.type) {
				case "note":
					return writeNote({ context, record });
				case "profile":
					return writeProfile({ context, record });
				case "playbook":
					return writePlaybook({ context, record });
				case "episode":
					return writeEpisode({ context, record });
				default:
					return {
						kind: "unsupported",
						reason: `Markdown memory does not support authored record type ${JSON.stringify(record.type)}.`,
					};
			}
		},

		async retrieve(scope, query) {
			assertBoundProjectRoot({
				boundProjectRoot: context.projectRoot,
				requestedProjectRoot: scope.projectRoot,
			});
			return retrieveMarkdownRecords({ ...context, scope, query });
		},

		async consolidate() {
			return {
				kind: "noop",
				reason: NOOP_REASON,
			};
		},
	};
}

async function writeEpisode(options: {
	readonly context: MarkdownStoreContext;
	readonly record: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	if (options.record.scope === "session") {
		return { kind: "unsupported", reason: SESSION_SKIPPED_REASON };
	}
	if (options.record.kind !== "episodic") {
		return {
			kind: "unsupported",
			reason: "Episode records require episodic memory kind.",
		};
	}
	if (!options.record.source?.trim()) {
		return {
			kind: "unsupported",
			reason: "Episode records require a non-empty source.",
		};
	}

	const timestamp =
		options.record.timestamp ?? options.context.now().toISOString();
	const baseFileName = episodeFileName({ record: options.record, timestamp });
	const paths = storePaths(options.context, options.record.scope);
	for (let suffix = 1; ; suffix += 1) {
		const fileName = suffixedEpisodeFileName(baseFileName, suffix);
		const path = join(paths.episodesDir, fileName);
		const episode: EpisodeRecordInput = {
			type: "episode",
			scope: options.record.scope,
			kind: "episodic",
			title: options.record.title,
			description: options.record.description,
			content: options.record.content,
			tags: options.record.tags,
			timestamp,
			source: options.record.source.trim(),
			resource: episodeResource(fileName),
		};
		const rendered = renderEpisodeRecord(episode);

		try {
			const existing = await readFileIfExists(path);
			if (existing === rendered) {
				return {
					kind: "written",
					path,
					record: toRetrievedRecord({ record: episode, path }),
				};
			}
			if (existing !== undefined) continue;
			if (!(await writeFileAtomicExclusive(path, rendered))) {
				// Lost the exclusive-create race. If the winner wrote identical
				// bytes (the common case for redundant terminal completion writers),
				// dedupe to their file instead of advancing to a duplicate suffix —
				// this keeps the exactly-one-terminal invariant atomic across
				// concurrent identical writers, not just sequential ones.
				const raced = await readFileIfExists(path);
				if (raced === rendered) {
					return {
						kind: "written",
						path,
						record: toRetrievedRecord({ record: episode, path }),
					};
				}
				continue;
			}
			return {
				kind: "written",
				path,
				record: toRetrievedRecord({ record: episode, path }),
			};
		} catch (error: unknown) {
			return failedWrite({ record: options.record, path, error });
		}
	}
}

async function writeNote(options: {
	readonly context: MarkdownStoreContext;
	readonly record: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	if (options.record.scope === "session") {
		return { kind: "unsupported", reason: SESSION_SKIPPED_REASON };
	}
	const scope = options.record.scope;
	const timestamp =
		options.record.timestamp ?? options.context.now().toISOString();
	const fileName = noteFileName({ record: options.record, timestamp });
	const resource = noteResource(fileName);
	const paths = storePaths(options.context, scope);
	const path = join(paths.root, resource);
	const note: AuthoredNoteInput = {
		type: "note",
		title: options.record.title,
		description: options.record.description,
		resource,
		tags: options.record.tags,
		timestamp,
		scope,
		kind: options.record.kind,
		source: options.record.source,
		content: options.record.content,
	};
	return persistAuthoredRecord({
		context: options.context,
		record: note,
		path,
		rendered: renderAuthoredRecord(note),
	});
}

async function writeProfile(options: {
	readonly context: MarkdownStoreContext;
	readonly record: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	if (options.record.scope !== "user") {
		return {
			kind: "unsupported",
			reason: "Profile records require user scope.",
		};
	}
	if (options.record.kind !== "semantic") {
		return {
			kind: "unsupported",
			reason: "Profile records require semantic memory kind.",
		};
	}
	const measuredBytes = Buffer.byteLength(options.record.content, "utf-8");
	if (measuredBytes > PROFILE_WRITE_MAX_BYTES) {
		return {
			kind: "unsupported",
			reason: `Profile body exceeds the ${PROFILE_WRITE_MAX_BYTES} UTF-8 byte write bound (measured ${measuredBytes} bytes).`,
		};
	}

	const paths = storePaths(options.context, "user");
	const path = paths.profilePath;
	let existing: string | undefined;
	try {
		existing = await readFileIfExists(path);
	} catch (error: unknown) {
		return failedWrite({ record: options.record, path, error });
	}
	if (existing !== undefined) {
		let parsed: ReturnType<typeof parseAuthoredRecord>;
		try {
			parsed = parseAuthoredRecord({
				raw: existing,
				expectedScope: "user",
				expectedType: "profile",
			});
		} catch (error: unknown) {
			return failedWrite({ record: options.record, path, error });
		}
		if (!parsed.ok) {
			return failedWrite({
				record: options.record,
				path,
				error: `Existing profile occupant is invalid: ${parsed.message}`,
			});
		}
	}

	const profile: AuthoredProfileInput = {
		type: "profile",
		title: PROFILE_TITLE,
		description: PROFILE_DESCRIPTION,
		resource: AGENT_MEMORY_PROFILE_RESOURCE,
		tags: options.record.tags,
		timestamp: options.record.timestamp ?? options.context.now().toISOString(),
		scope: "user",
		kind: "semantic",
		source: options.record.source,
		content: options.record.content,
	};
	const rendered = renderAuthoredRecord(profile);
	// The profile is a singleton replaced whole; keep exactly one prior version
	// so any overwrite — model-authored or a racing session — stays recoverable.
	// Refuse to replace what cannot be backed up.
	if (existing !== undefined && existing !== rendered) {
		try {
			await writeFileAtomic(paths.profilePreviousPath, existing);
		} catch (error: unknown) {
			return failedWrite({ record: options.record, path, error });
		}
	}
	return persistAuthoredRecord({
		context: options.context,
		record: profile,
		path,
		rendered,
		existing,
	});
}

async function writePlaybook(options: {
	readonly context: MarkdownStoreContext;
	readonly record: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	if (options.record.scope === "session") {
		return { kind: "unsupported", reason: SESSION_SKIPPED_REASON };
	}
	const scope = options.record.scope;
	if (options.record.kind !== "procedural") {
		return {
			kind: "unsupported",
			reason: "Playbook records require procedural memory kind.",
		};
	}
	const canonicalKey = canonicalizePlaybookName(options.record.title);
	if (!canonicalKey) {
		return {
			kind: "unsupported",
			reason: "Playbook canonical key is empty after title normalization.",
		};
	}

	const paths = storePaths(options.context, scope);
	const defaultFileName = `${canonicalKey}.md`;
	const defaultPath = join(paths.playbooksDir, defaultFileName);
	let path = defaultPath;
	let existing: string | undefined;
	try {
		const current = await readPlaybookRecords({
			storePaths: paths,
			warnings: [],
			tally: newScanTally(),
		});
		const matches = current.filter(
			(record) => canonicalizePlaybookName(record.title) === canonicalKey,
		);
		if (matches.length > 1) {
			return failedWrite({
				record: options.record,
				path: defaultPath,
				error: `Multiple playbooks claim canonical title ${JSON.stringify(canonicalKey)}: ${matches
					.map((record) => record.path)
					.sort()
					.join(", ")}.`,
			});
		}

		if (matches.length === 1) {
			path = matches[0]?.path ?? defaultPath;
			existing = await readFile(path, "utf-8");
		} else {
			existing = await readFileIfExists(defaultPath);
			if (existing !== undefined) {
				const occupant = parseAuthoredRecord({
					raw: existing,
					expectedScope: scope,
					expectedType: "playbook",
				});
				if (!occupant.ok) {
					return failedWrite({
						record: options.record,
						path: defaultPath,
						error: `Default playbook path has an invalid occupant: ${occupant.message}`,
					});
				}
				if (canonicalizePlaybookName(occupant.record.title) === canonicalKey) {
					path = defaultPath;
				} else {
					path = await firstAvailablePlaybookPath({
						playbooksDir: paths.playbooksDir,
						canonicalKey,
					});
					existing = undefined;
				}
			}
		}
	} catch (error: unknown) {
		return failedWrite({ record: options.record, path, error });
	}

	const fileName = path.slice(paths.playbooksDir.length + 1);
	const title = options.record.title.trim();
	const playbook: AuthoredPlaybookInput = {
		type: "playbook",
		title,
		description: options.record.description.trim() || title,
		resource: playbookResource(fileName),
		tags: options.record.tags,
		timestamp: options.record.timestamp ?? options.context.now().toISOString(),
		scope,
		kind: "procedural",
		source: options.record.source,
		content: options.record.content,
	};
	return persistAuthoredRecord({
		context: options.context,
		record: playbook,
		path,
		rendered: renderAuthoredRecord(playbook),
		existing,
	});
}

async function persistAuthoredRecord(options: {
	readonly context: MarkdownStoreContext;
	readonly record: AuthoredRecordInput;
	readonly path: string;
	readonly rendered: string;
	readonly existing?: string;
}): Promise<MemoryWriteResult> {
	let existing = options.existing;
	try {
		if (existing === undefined) existing = await readFileIfExists(options.path);
		await writeFileIfChanged(options.path, options.rendered, existing);
		await regenerateIndex({
			projectRoot: options.context.projectRoot,
			userCosmonautsRoot: options.context.userCosmonautsRoot,
			scope: options.record.scope,
		});
		return {
			kind: "written",
			path: options.path,
			record: toRetrievedRecord({ record: options.record, path: options.path }),
		};
	} catch (error: unknown) {
		if (existing === undefined) {
			await unlink(options.path).catch(() => undefined);
		}
		return failedWrite({ record: options.record, path: options.path, error });
	}
}

function failedWrite(options: {
	readonly record: Pick<MemoryRecordDraft, "type" | "scope">;
	readonly path: string;
	readonly error: unknown;
}): MemoryWriteResult {
	const reason =
		options.error instanceof Error
			? options.error.message
			: String(options.error);
	return {
		kind: "failed",
		path: options.path,
		reason: `Failed to write ${options.record.type} in ${options.record.scope} scope at ${options.path}: ${reason}`,
	};
}

async function retrieveMarkdownRecords(
	options: MarkdownStoreContext & {
		readonly scope: MemoryScopeContext;
		readonly query: MemoryQuery;
	},
): Promise<MemoryRetrieveResult> {
	const startedAt = performance.now();
	const searchedScopes: MemoryScopeName[] = [];
	const skippedScopes = [];
	const warnings: MemoryWarning[] = [];
	const records: RetrievedMemoryRecord[] = [];
	const tally = newScanTally();

	for (const scope of options.scope.scopes) {
		if (scope === "session") {
			skippedScopes.push({
				scope,
				reason: SESSION_SKIPPED_REASON,
			});
			continue;
		}

		searchedScopes.push(scope);
		const paths = storePaths(options, scope);
		const scopeRecords = await readStoreRecords({
			storePaths: paths,
			warnings,
			tally,
		});
		if (options.query.recordTypes?.includes("episode")) {
			scopeRecords.push(
				...(await readEpisodeRecords({
					storePaths: paths,
					warnings,
					tally,
					warningThreshold: options.episodeWarningThreshold,
				})),
			);
		}
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
		stats: {
			filesScanned: tally.filesScanned,
			bytesRead: tally.bytesRead,
			durationMs: performance.now() - startedAt,
		},
	};
}

async function readEpisodeRecords(options: {
	readonly storePaths: ReturnType<typeof resolveAgentMemoryStorePaths>;
	readonly warnings: MemoryWarning[];
	readonly tally: ScanTally;
	readonly warningThreshold: number;
}): Promise<RetrievedMemoryRecord[]> {
	const files = await listMarkdownFiles(options.storePaths.episodesDir);
	const directChildren = files.filter(
		(path) => dirname(path) === options.storePaths.episodesDir,
	);
	if (directChildren.length > options.warningThreshold) {
		options.warnings.push({
			path: options.storePaths.episodesDir,
			message: `episode log large — ${directChildren.length} records; run consolidation`,
		});
	}
	const records: RetrievedMemoryRecord[] = [];
	for (const path of files) {
		if (dirname(path) !== options.storePaths.episodesDir) {
			options.warnings.push({
				path,
				message:
					"Episode records must be direct children of the episodes directory.",
			});
			continue;
		}
		const record = await parseMarkdownRecord({
			path,
			expectedScope: options.storePaths.scope,
			expectedType: "episode",
			warnings: options.warnings,
			tally: options.tally,
		});
		if (record) records.push(record);
	}
	return records;
}

/** Mutable scan-cost accumulator threaded through one store scan. */
interface ScanTally {
	filesScanned: number;
	bytesRead: number;
}

function newScanTally(): ScanTally {
	return { filesScanned: 0, bytesRead: 0 };
}

function tallyRead(tally: ScanTally, raw: string): void {
	tally.filesScanned += 1;
	tally.bytesRead += Buffer.byteLength(raw, "utf-8");
}

async function readStoreRecords(options: {
	readonly storePaths: ReturnType<typeof resolveAgentMemoryStorePaths>;
	readonly warnings: MemoryWarning[];
	readonly tally: ScanTally;
}): Promise<RetrievedMemoryRecord[]> {
	const records: RetrievedMemoryRecord[] = [];
	const noteFiles = await listMarkdownFiles(options.storePaths.notesDir);
	for (const path of noteFiles) {
		const record = await parseMarkdownRecord({
			path,
			expectedScope: options.storePaths.scope,
			expectedType: "note",
			warnings: options.warnings,
			tally: options.tally,
		});
		if (record) records.push(record);
	}

	const profile = await parseMarkdownRecordIfExists({
		path: options.storePaths.profilePath,
		expectedScope: options.storePaths.scope,
		expectedType: "profile",
		warnings: options.warnings,
		tally: options.tally,
	});
	if (profile) records.push(profile);

	const playbooks = await readPlaybookRecords(options);
	records.push(...playbooks);
	warnForDuplicatePlaybookTitles(playbooks, options.warnings);
	return records;
}

async function readPlaybookRecords(options: {
	readonly storePaths: ReturnType<typeof resolveAgentMemoryStorePaths>;
	readonly warnings: MemoryWarning[];
	readonly tally: ScanTally;
}): Promise<RetrievedMemoryRecord[]> {
	const files = await listMarkdownFiles(options.storePaths.playbooksDir);
	const records: RetrievedMemoryRecord[] = [];
	for (const path of files) {
		if (dirname(path) !== options.storePaths.playbooksDir) {
			options.warnings.push({
				path,
				message:
					"Playbook records must be direct children of the playbooks directory.",
			});
			continue;
		}
		const record = await parseMarkdownRecord({
			path,
			expectedScope: options.storePaths.scope,
			expectedType: "playbook",
			warnings: options.warnings,
			tally: options.tally,
		});
		if (record) records.push(record);
	}
	return records;
}

async function parseMarkdownRecordIfExists(options: {
	readonly path: string;
	readonly expectedScope: DurableScope;
	readonly expectedType: "note" | "profile" | "playbook";
	readonly warnings: MemoryWarning[];
	readonly tally: ScanTally;
}): Promise<RetrievedMemoryRecord | undefined> {
	let raw: string | undefined;
	try {
		raw = await readFileIfExists(options.path);
	} catch (error: unknown) {
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
	if (raw === undefined) return undefined;
	tallyRead(options.tally, raw);
	return parseRawRecord({ ...options, raw });
}

async function parseMarkdownRecord(options: {
	readonly path: string;
	readonly expectedScope: DurableScope;
	readonly expectedType: "note" | "profile" | "playbook" | "episode";
	readonly warnings: MemoryWarning[];
	readonly tally: ScanTally;
}): Promise<RetrievedMemoryRecord | undefined> {
	try {
		const raw = await readFile(options.path, "utf-8");
		tallyRead(options.tally, raw);
		return parseRawRecord({ ...options, raw });
	} catch (error: unknown) {
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

function parseRawRecord(options: {
	readonly path: string;
	readonly raw: string;
	readonly expectedScope: DurableScope;
	readonly expectedType: "note" | "profile" | "playbook" | "episode";
	readonly warnings: MemoryWarning[];
}): RetrievedMemoryRecord | undefined {
	try {
		const parsed =
			options.expectedType === "episode"
				? parseEpisodeOkfRecord(options)
				: parseAuthoredRecord({
						raw: options.raw,
						expectedScope: options.expectedScope,
						expectedType: options.expectedType,
					});
		if (!parsed.ok) {
			options.warnings.push({ path: options.path, message: parsed.message });
			return undefined;
		}
		return toRetrievedRecord({ record: parsed.record, path: options.path });
	} catch (error: unknown) {
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

function warnForDuplicatePlaybookTitles(
	records: readonly RetrievedMemoryRecord[],
	warnings: MemoryWarning[],
): void {
	const byCanonicalTitle = new Map<string, RetrievedMemoryRecord[]>();
	for (const record of records) {
		const key = canonicalizePlaybookName(record.title);
		const matches = byCanonicalTitle.get(key) ?? [];
		matches.push(record);
		byCanonicalTitle.set(key, matches);
	}
	for (const [key, matches] of byCanonicalTitle) {
		if (matches.length < 2) continue;
		const paths = matches.map((record) => record.path).sort();
		warnings.push({
			path: paths[0],
			message: `Multiple playbook records share canonical title ${JSON.stringify(key)}: ${paths.join(", ")}.`,
		});
	}
}

async function regenerateIndex(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
	readonly scope: DurableScope;
}): Promise<void> {
	const paths = resolveAgentMemoryStorePaths(options);
	const records = (
		await readStoreRecords({
			storePaths: paths,
			warnings: [],
			tally: newScanTally(),
		})
	).filter((record) => record.type !== "profile" && record.type !== "episode");
	sortRecords(records);
	await writeFileIfChanged(paths.indexPath, renderIndex({ records }));
}

function renderIndex(options: {
	readonly records: readonly RetrievedMemoryRecord[];
}): string {
	const lines = [
		"---",
		"type: memory-index",
		`resource: ${AGENT_MEMORY_INDEX_RESOURCE}`,
		"---",
		"",
		"# Agent Memory Index",
		"",
	];

	if (options.records.length === 0) {
		lines.push("No valid authored records.");
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

async function firstAvailablePlaybookPath(options: {
	readonly playbooksDir: string;
	readonly canonicalKey: string;
}): Promise<string> {
	// One listing, then an in-memory scan: the first free suffix is always found
	// (D-003 — a freed canonical name must never become uncreatable) without a
	// serial stat per occupied candidate.
	const taken = new Set(await readdirIfExists(options.playbooksDir));
	for (let suffix = 2; ; suffix += 1) {
		const fileName = `${options.canonicalKey}-${suffix}.md`;
		if (!taken.has(fileName)) return join(options.playbooksDir, fileName);
	}
}

async function readdirIfExists(directory: string): Promise<string[]> {
	try {
		return await readdir(directory);
	} catch (error: unknown) {
		if (isMissingFile(error)) return [];
		throw error;
	}
}

async function writeFileIfChanged(
	path: string,
	content: string,
	existing?: string,
): Promise<void> {
	const previous = existing ?? (await readFileIfExists(path));
	if (previous === content) return;
	await writeFileAtomic(path, content);
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
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

async function writeFileAtomicExclusive(
	path: string,
	content: string,
): Promise<boolean> {
	await mkdir(dirname(path), { recursive: true });
	const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(tempPath, content, { encoding: "utf-8", flag: "wx" });
		try {
			await link(tempPath, path);
			return true;
		} catch (error: unknown) {
			if (isExistingFile(error)) return false;
			throw error;
		}
	} finally {
		await unlink(tempPath).catch(() => undefined);
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
	readonly record: AuthoredRecordInput | EpisodeRecordInput;
	readonly path: string;
}): RetrievedMemoryRecord {
	return {
		type: options.record.type,
		scope: options.record.scope,
		kind: options.record.kind,
		title: options.record.title,
		description: options.record.description,
		resource: options.record.resource,
		tags: options.record.tags,
		timestamp: options.record.timestamp,
		...(options.record.source ? { source: options.record.source } : {}),
		content: options.record.content,
		path: options.path,
	};
}

function episodeFileName(options: {
	readonly record: MemoryRecordDraft;
	readonly timestamp: string;
}): string {
	const action = options.record.tags
		.find((tag) => tag.startsWith("action:"))
		?.slice("action:".length);
	const hash = createHash("sha256")
		.update(
			JSON.stringify({
				type: "episode",
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
	return `${timestampForFile(options.timestamp)}-${slugify(action ?? "episode")}-${hash}.md`;
}

function suffixedEpisodeFileName(baseFileName: string, suffix: number): string {
	if (suffix === 1) return baseFileName;
	return `${baseFileName.slice(0, -".md".length)}-${suffix}.md`;
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

function storePaths(
	context: Pick<MarkdownStoreContext, "projectRoot" | "userCosmonautsRoot">,
	scope: DurableScope,
): ReturnType<typeof resolveAgentMemoryStorePaths> {
	return resolveAgentMemoryStorePaths({ ...context, scope });
}

function isMissingFile(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

function isExistingFile(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "EEXIST"
	);
}
