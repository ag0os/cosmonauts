import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { constants } from "node:fs";
import {
	link,
	lstat,
	mkdir,
	open,
	readdir,
	realpath,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import {
	normalizeKnowledgeProposal,
	parseHumanKnowledgeRecord,
	parseKnowledgeProposalOccupant,
	renderKnowledgeProposal,
	toRetrievedKnowledgeRecord,
} from "./knowledge-records.ts";
import { assertBoundProjectRoot } from "./paths.ts";
import type {
	KnowledgeProposalIdentity,
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

interface ScanTally {
	filesScanned: number;
	bytesRead: number;
}

export function createKnowledgeMemoryStore(
	options: KnowledgeMemoryStoreOptions,
): MemoryStore {
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

		async retrieve(scope, query) {
			assertBoundProjectRoot({
				boundProjectRoot: context.projectRoot,
				requestedProjectRoot: scope.projectRoot,
			});
			return retrieveKnowledge({ context, scope, query });
		},

		async consolidate() {
			return { kind: "noop", reason: NOOP_REASON };
		},
	};
}

async function retrieveKnowledge(options: {
	readonly context: KnowledgeStoreContext;
	readonly scope: MemoryScopeContext;
	readonly query: MemoryQuery;
}): Promise<MemoryRetrieveResult> {
	const startedAt = performance.now();
	const searchedScopes: MemoryScopeName[] = [];
	const skippedScopes = [];
	const warnings: MemoryWarning[] = [];
	const records: RetrievedMemoryRecord[] = [];
	const tally: ScanTally = { filesScanned: 0, bytesRead: 0 };

	for (const scope of options.scope.scopes) {
		if (scope === "session") {
			skippedScopes.push({ scope, reason: SESSION_SKIPPED_REASON });
			continue;
		}
		searchedScopes.push(scope);
		const root = knowledgeRoot(options.context, scope);
		const paths = await listKnowledgeFiles(root, warnings);
		for (const path of paths) {
			const scanned = await scanKnowledgeFile(path, warnings);
			if (!scanned) continue;
			tally.filesScanned += 1;
			tally.bytesRead += Buffer.byteLength(scanned.raw, "utf-8");
			try {
				const parsed = parseHumanKnowledgeRecord({
					raw: scanned.raw,
					physicalResource: toPosixRelative(root, path),
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
				if (matchesQuery(record, options.query)) records.push(record);
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
	const proposalRoot = join(options.context.projectRoot, PROPOSAL_DIRECTORY);
	const planDirectory = join(
		proposalRoot,
		normalized.proposalIdentity.planSlug,
	);
	const path = join(planDirectory, basename(normalized.record.resource));

	try {
		await ensureSafeProposalDirectory({
			projectRoot: options.context.projectRoot,
			proposalRoot,
			planDirectory,
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
		const created = await writeAtomicExclusive({ path, content: rendered });
		if (!created) {
			const winner = await readExistingRegularFile(path);
			if (winner === undefined) {
				throw new Error("Proposal creation race ended without an occupant.");
			}
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

async function ensureSafeProposalDirectory(options: {
	readonly projectRoot: string;
	readonly proposalRoot: string;
	readonly planDirectory: string;
}): Promise<void> {
	await ensureRealDirectory(options.projectRoot, true);
	let current = options.projectRoot;
	for (const segment of ["memory", "agent", "proposals"]) {
		current = join(current, segment);
		await ensureRealDirectory(current, false);
	}
	await ensureRealDirectory(options.planDirectory, false);

	const [projectRealPath, proposalRealPath, planRealPath] = await Promise.all([
		realpath(options.projectRoot),
		realpath(options.proposalRoot),
		realpath(options.planDirectory),
	]);
	if (
		!isContained(projectRealPath, proposalRealPath) ||
		!isContained(proposalRealPath, planRealPath)
	) {
		throw new Error("Knowledge proposal path escapes its real project root.");
	}
}

async function ensureRealDirectory(
	path: string,
	recursive: boolean,
): Promise<void> {
	try {
		const metadata = await lstat(path);
		if (metadata.isSymbolicLink()) {
			throw new Error(`Knowledge proposal directory is a symlink: ${path}`);
		}
		if (!metadata.isDirectory()) {
			throw new Error(`Knowledge proposal path is not a directory: ${path}`);
		}
		return;
	} catch (error: unknown) {
		if (!isMissingPath(error)) throw error;
	}

	try {
		await mkdir(path, { recursive });
	} catch (error: unknown) {
		if (!isExistingPath(error)) throw error;
	}
	const created = await lstat(path);
	if (created.isSymbolicLink()) {
		throw new Error(`Knowledge proposal directory is a symlink: ${path}`);
	}
	if (!created.isDirectory()) {
		throw new Error(`Knowledge proposal path is not a directory: ${path}`);
	}
}

async function writeAtomicExclusive(options: {
	readonly path: string;
	readonly content: string;
}): Promise<boolean> {
	const tempPath = join(
		dirname(options.path),
		`.${basename(options.path)}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(tempPath, options.content, {
			encoding: "utf-8",
			flag: "wx",
		});
		try {
			await link(tempPath, options.path);
			return true;
		} catch (error: unknown) {
			if (isExistingPath(error)) return false;
			throw error;
		}
	} finally {
		await unlink(tempPath).catch(() => undefined);
	}
}

async function listKnowledgeFiles(
	root: string,
	warnings: MemoryWarning[],
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
	await collectKnowledgeFiles({ directory: root, files, warnings });
	return files.sort();
}

async function collectKnowledgeFiles(options: {
	readonly directory: string;
	readonly files: string[];
	readonly warnings: MemoryWarning[];
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

async function scanKnowledgeFile(
	path: string,
	warnings: MemoryWarning[],
): Promise<ScannedFile | undefined> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) return undefined;
			return { raw: await handle.readFile("utf-8"), mtime: metadata.mtime };
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (isMissingPath(error) || isSymlinkPath(error)) return undefined;
		warnings.push({
			path,
			message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
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

function isContained(parent: string, child: string): boolean {
	const relativePath = relative(parent, child);
	return (
		relativePath.length > 0 &&
		!relativePath.startsWith(`..${sep}`) &&
		relativePath !== ".." &&
		!isAbsolute(relativePath)
	);
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

function isExistingPath(error: unknown): boolean {
	return errorCode(error) === "EEXIST";
}

function isSymlinkPath(error: unknown): boolean {
	return errorCode(error) === "ELOOP";
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
