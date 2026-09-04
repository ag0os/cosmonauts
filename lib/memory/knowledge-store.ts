import type { Dirent } from "node:fs";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { createDurableMachineFiles } from "./durable-files.ts";
import {
	normalizeKnowledgeProposal,
	parseHumanKnowledgeRecord,
	parseKnowledgeProposalOccupant,
	renderKnowledgeProposal,
	toRetrievedKnowledgeRecord,
} from "./knowledge-records.ts";
import { assertBoundProjectRoot } from "./paths.ts";
import { ensureSafeContainedDirectory } from "./proposal-files.ts";
import type {
	KnowledgeConsolidator,
	KnowledgeProposalIdentity,
	MemoryConsolidateOptions,
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

const SESSION_SKIPPED_REASON =
	"Knowledge has no session-scoped root; durable knowledge is project or user scoped.";
const NOOP_REASON =
	"The knowledge store does not consolidate, promote, retain, or prune records.";
const KNOWLEDGE_DIRECTORY = "knowledge";
const PROPOSAL_DIRECTORY = join("memory", "agent", "proposals");

export interface KnowledgeMemoryStoreOptions {
	readonly projectRoot: string;
	readonly userCosmonautsRoot?: string;
	readonly now?: () => Date;
	readonly consolidator?: KnowledgeConsolidator;
}

interface KnowledgeStoreContext {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}

type DurableScope = Exclude<MemoryScopeName, "session">;

interface ScannedFile {
	readonly raw: string;
	readonly mtime: Date;
}

interface KnowledgeReadOptions {
	readonly byteLimits?: {
		readonly maxRecordBytes: number;
		readonly maxAggregateBytes: number;
	};
	readonly includeRawContent?: boolean;
}

interface KnowledgeRetrievedMemoryRecord extends RetrievedMemoryRecord {
	readonly rawContent?: string;
}

interface KnowledgeReadDecline {
	readonly code: "record-byte-limit" | "aggregate-byte-limit";
	readonly scope: "project" | "user";
	readonly path: string;
	readonly reason: string;
}

interface KnowledgeRetrieveResult extends MemoryRetrieveResult {
	readonly records: readonly KnowledgeRetrievedMemoryRecord[];
	readonly readDeclines?: readonly KnowledgeReadDecline[];
}

interface KnowledgeMemoryStore extends MemoryStore {
	retrieve(
		scope: MemoryScopeContext,
		query: MemoryQuery,
		readOptions?: KnowledgeReadOptions,
	): Promise<KnowledgeRetrieveResult>;
}

type KnowledgeScanResult =
	| { readonly kind: "read"; readonly file: ScannedFile }
	| { readonly kind: "declined"; readonly decline: KnowledgeReadDecline }
	| { readonly kind: "skipped" };

interface ScanTally {
	filesScanned: number;
	bytesRead: number;
}

export function createKnowledgeMemoryStore(
	options: KnowledgeMemoryStoreOptions,
): KnowledgeMemoryStore {
	const context: KnowledgeStoreContext = {
		projectRoot: resolve(options.projectRoot),
		userCosmonautsRoot: resolve(
			options.userCosmonautsRoot ?? join(homedir(), ".cosmonauts"),
		),
	};

	return {
		async write(record) {
			return writeKnowledgeProposal({ context, draft: record });
		},

		async retrieve(scope, query, readOptions) {
			assertBoundProjectRoot({
				boundProjectRoot: context.projectRoot,
				requestedProjectRoot: scope.projectRoot,
			});
			return retrieveKnowledge({ context, scope, query, readOptions });
		},

		async consolidate(consolidateOptions?: MemoryConsolidateOptions) {
			return options.consolidator
				? options.consolidator(consolidateOptions)
				: { kind: "noop", reason: NOOP_REASON };
		},
	};
}

async function retrieveKnowledge(options: {
	readonly context: KnowledgeStoreContext;
	readonly scope: MemoryScopeContext;
	readonly query: MemoryQuery;
	readonly readOptions?: KnowledgeReadOptions;
}): Promise<KnowledgeRetrieveResult> {
	const startedAt = performance.now();
	const searchedScopes: MemoryScopeName[] = [];
	const skippedScopes = [];
	const warnings: MemoryWarning[] = [];
	const records: KnowledgeRetrievedMemoryRecord[] = [];
	const readDeclines: KnowledgeReadDecline[] = [];
	const tally: ScanTally = { filesScanned: 0, bytesRead: 0 };
	assertReadOptions(options.readOptions);

	for (const scope of options.scope.scopes) {
		if (scope === "session") {
			skippedScopes.push({ scope, reason: SESSION_SKIPPED_REASON });
			continue;
		}
		searchedScopes.push(scope);
		const root = knowledgeRoot(options.context, scope);
		const paths = await listKnowledgeFiles(
			root,
			warnings,
			options.query.includeRetired === true,
		);
		for (const path of paths) {
			const scan = await scanKnowledgeFile({
				path,
				scope,
				warnings,
				...(options.readOptions?.byteLimits === undefined
					? {}
					: {
							limits: {
								maxRecordBytes: options.readOptions.byteLimits.maxRecordBytes,
								remainingBytes: Math.max(
									0,
									options.readOptions.byteLimits.maxAggregateBytes -
										tally.bytesRead,
								),
							},
						}),
			});
			if (scan.kind === "declined") {
				readDeclines.push(scan.decline);
				continue;
			}
			if (scan.kind === "skipped") continue;
			const scanned = scan.file;
			tally.filesScanned += 1;
			tally.bytesRead += Buffer.byteLength(scanned.raw, "utf-8");
			try {
				const physicalResource = toPosixRelative(root, path);
				const retired = physicalResource.startsWith("retired/");
				const logicalResource = retired
					? physicalResource.slice("retired/".length)
					: physicalResource;
				const parsed = parseHumanKnowledgeRecord({
					raw: scanned.raw,
					physicalResource: logicalResource,
					physicalScope: scope,
					mtime: scanned.mtime,
				});
				if (!parsed.ok) {
					warnings.push({ path, message: parsed.message });
					continue;
				}
				const record = toRetrievedKnowledgeRecord({
					record: parsed.record,
					path,
				});
				if (matchesQuery(record, options.query)) {
					records.push({
						...record,
						...(options.readOptions?.includeRawContent
							? { rawContent: scanned.raw }
							: {}),
						...(retired ? { retired: true } : {}),
					});
				}
			} catch (error: unknown) {
				warnings.push({
					path,
					message: error instanceof Error ? error.message : String(error),
				});
			}
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
				: records.slice(0, Math.max(0, options.query.limit)),
		searchedScopes,
		skippedScopes,
		warnings,
		...(options.readOptions?.byteLimits === undefined
			? {}
			: { readDeclines: Object.freeze(readDeclines) }),
		stats: {
			filesScanned: tally.filesScanned,
			bytesRead: tally.bytesRead,
			durationMs: performance.now() - startedAt,
		},
	};
}

async function writeKnowledgeProposal(options: {
	readonly context: KnowledgeStoreContext;
	readonly draft: MemoryRecordDraft;
}): Promise<MemoryWriteResult> {
	const normalized = normalizeKnowledgeProposal(options.draft);
	if (!normalized.ok) {
		return { kind: "unsupported", reason: normalized.message };
	}
	const relativeDirectory = `${PROPOSAL_DIRECTORY.split(sep).join("/")}/${normalized.proposalIdentity.planSlug}`;
	const planDirectory = join(options.context.projectRoot, relativeDirectory);
	const path = join(planDirectory, basename(normalized.record.resource));

	try {
		await ensureSafeContainedDirectory({
			root: options.context.projectRoot,
			relativeDirectory,
			label: "Knowledge proposal",
		});
		const existing = await readExistingRegularFile(path);
		if (existing !== undefined) {
			return existingProposalResult({
				raw: existing.raw,
				path,
				record: normalized.record,
				proposalIdentity: normalized.proposalIdentity,
			});
		}

		const rendered = renderKnowledgeProposal(normalized.record);
		try {
			await createDurableMachineFiles().writeText({ path, content: rendered });
		} catch (error: unknown) {
			if (!isDurableIdentityConflict(error)) throw error;
			const winner = await readExistingRegularFile(path);
			if (winner === undefined) throw error;
			return existingProposalResult({
				raw: winner.raw,
				path,
				record: normalized.record,
				proposalIdentity: normalized.proposalIdentity,
			});
		}
		return {
			kind: "written",
			path,
			record: toRetrievedKnowledgeRecord({
				record: normalized.record,
				path,
			}),
		};
	} catch (error: unknown) {
		return failedProposalWrite({ path, error });
	}
}

function existingProposalResult(options: {
	readonly raw: string;
	readonly path: string;
	readonly record: Parameters<
		typeof parseKnowledgeProposalOccupant
	>[0]["expected"];
	readonly proposalIdentity: KnowledgeProposalIdentity;
}): MemoryWriteResult {
	try {
		const parsed = parseKnowledgeProposalOccupant({
			raw: options.raw,
			expected: options.record,
			proposalIdentity: options.proposalIdentity,
		});
		if (!parsed.ok) {
			return failedProposalWrite({ path: options.path, error: parsed.message });
		}
		return {
			kind: "written",
			path: options.path,
			record: toRetrievedKnowledgeRecord({
				record: parsed.record,
				path: options.path,
			}),
		};
	} catch (error: unknown) {
		return failedProposalWrite({ path: options.path, error });
	}
}

async function listKnowledgeFiles(
	root: string,
	warnings: MemoryWarning[],
	includeRetired: boolean,
): Promise<string[]> {
	try {
		const metadata = await lstat(root);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) return [];
	} catch (error: unknown) {
		if (isMissingPath(error)) return [];
		warnings.push({
			path: root,
			message: error instanceof Error ? error.message : String(error),
		});
		return [];
	}

	const files: string[] = [];
	await collectKnowledgeFiles({
		root,
		directory: root,
		files,
		warnings,
		includeRetired,
	});
	return files.sort();
}

async function collectKnowledgeFiles(options: {
	readonly root: string;
	readonly directory: string;
	readonly files: string[];
	readonly warnings: MemoryWarning[];
	readonly includeRetired: boolean;
}): Promise<void> {
	let entries: Dirent[];
	try {
		const metadata = await lstat(options.directory);
		if (metadata.isSymbolicLink() || !metadata.isDirectory()) return;
		entries = await readdir(options.directory, { withFileTypes: true });
	} catch (error: unknown) {
		if (isMissingPath(error)) return;
		options.warnings.push({
			path: options.directory,
			message: error instanceof Error ? error.message : String(error),
		});
		return;
	}

	for (const entry of entries) {
		const path = join(options.directory, entry.name);
		if (entry.isDirectory()) {
			if (
				!options.includeRetired &&
				options.directory === options.root &&
				entry.name === "retired"
			) {
				continue;
			}
			await collectKnowledgeFiles({ ...options, directory: path });
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			entry.name !== "index.md"
		) {
			options.files.push(path);
		}
	}
}

async function scanKnowledgeFile(options: {
	readonly path: string;
	readonly scope: "project" | "user";
	readonly warnings: MemoryWarning[];
	readonly limits?: {
		readonly maxRecordBytes: number;
		readonly remainingBytes: number;
	};
}): Promise<KnowledgeScanResult> {
	try {
		const handle = await open(
			options.path,
			constants.O_RDONLY | constants.O_NOFOLLOW,
		);
		try {
			if (options.limits === undefined) {
				const metadata = await handle.stat();
				if (!metadata.isFile()) return { kind: "skipped" };
				return {
					kind: "read",
					file: { raw: await handle.readFile("utf-8"), mtime: metadata.mtime },
				};
			}
			const before = await handle.stat({ bigint: true });
			if (!before.isFile()) return { kind: "skipped" };
			if (before.size > BigInt(options.limits.maxRecordBytes)) {
				return {
					kind: "declined",
					decline: {
						code: "record-byte-limit",
						scope: options.scope,
						path: options.path,
						reason: `Knowledge record requires ${before.size.toLocaleString("en-US")} bytes; the read-time per-record ceiling is ${options.limits.maxRecordBytes.toLocaleString("en-US")} bytes.`,
					},
				};
			}
			if (before.size > BigInt(options.limits.remainingBytes)) {
				return {
					kind: "declined",
					decline: {
						code: "aggregate-byte-limit",
						scope: options.scope,
						path: options.path,
						reason: `Knowledge record requires ${before.size.toLocaleString("en-US")} bytes; the remaining aggregate read-time allowance is ${options.limits.remainingBytes.toLocaleString("en-US")} bytes.`,
					},
				};
			}
			const size = Number(before.size);
			const buffer = Buffer.alloc(size);
			let offset = 0;
			while (offset < size) {
				const read = await handle.read(buffer, offset, size - offset, offset);
				if (read.bytesRead === 0) break;
				offset += read.bytesRead;
			}
			const after = await handle.stat({ bigint: true });
			if (offset !== size || after.size !== before.size) {
				throw new Error(
					`Knowledge record changed during bounded read: ${options.path}`,
				);
			}
			return {
				kind: "read",
				file: {
					raw: buffer.toString("utf-8"),
					mtime: new Date(Number(before.mtimeMs)),
				},
			};
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (isMissingPath(error) || isSymlinkPath(error)) {
			return { kind: "skipped" };
		}
		options.warnings.push({
			path: options.path,
			message: error instanceof Error ? error.message : String(error),
		});
		return { kind: "skipped" };
	}
}

function assertReadOptions(options: KnowledgeReadOptions | undefined): void {
	if (options?.includeRawContent && options.byteLimits === undefined) {
		throw new Error(
			"Raw knowledge content requires explicit read byte limits.",
		);
	}
	if (options?.byteLimits === undefined) return;
	for (const [name, value] of Object.entries(options.byteLimits)) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`Knowledge ${name} must be a positive integer.`);
		}
	}
}

async function readExistingRegularFile(
	path: string,
): Promise<ScannedFile | undefined> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				throw new Error(`Proposal occupant is not a regular file: ${path}`);
			}
			return { raw: await handle.readFile("utf-8"), mtime: metadata.mtime };
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (isMissingPath(error)) return undefined;
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
		record.tags.join(" "),
		record.resource,
		record.content,
	]
		.join("\n")
		.toLowerCase()
		.includes(text);
}

function knowledgeRoot(
	context: KnowledgeStoreContext,
	scope: DurableScope,
): string {
	return join(
		scope === "project" ? context.projectRoot : context.userCosmonautsRoot,
		KNOWLEDGE_DIRECTORY,
	);
}

function toPosixRelative(root: string, path: string): string {
	return relative(root, path).split(sep).join("/");
}

function failedProposalWrite(options: {
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
		reason: `Failed to write knowledge proposal at ${options.path}: ${reason}`,
	};
}

function isMissingPath(error: unknown): boolean {
	return errorCode(error) === "ENOENT";
}

function isSymlinkPath(error: unknown): boolean {
	return errorCode(error) === "ELOOP";
}

function isDurableIdentityConflict(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.startsWith("Durable file identity conflict at ")
	);
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
