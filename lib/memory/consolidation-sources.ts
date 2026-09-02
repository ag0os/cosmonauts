import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import {
	createDurableMachineFiles,
	type DurableMachineFiles,
} from "./durable-files.ts";
import { createKnowledgeMemoryStore } from "./knowledge-store.ts";
import { createMarkdownMemoryStore } from "./markdown-store.ts";
import {
	consolidationEvidenceKey,
	isSafePosixRelativePath,
} from "./path-safety.ts";
import type { RetrievedMemoryRecord } from "./types.ts";

export const CONSOLIDATION_SOURCE_SCOPES = ["project", "user"] as const;
export type ConsolidationSourceScope =
	(typeof CONSOLIDATION_SOURCE_SCOPES)[number];

export const CONSOLIDATION_SOURCE_KINDS = [
	"knowledge",
	"episode",
	"artifact",
	"reflection",
] as const;
export type ConsolidationSourceKind =
	(typeof CONSOLIDATION_SOURCE_KINDS)[number];

export interface ConsolidationSourceRecord {
	readonly id: string;
	readonly sourceId: string;
	readonly scope: ConsolidationSourceScope;
	readonly path: string;
	readonly digest: string;
	readonly kind: ConsolidationSourceKind;
	readonly content: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly fileIdentity?: {
		readonly device: string;
		readonly inode: string;
	};
}

export interface ConsolidationSourceInventoryRecord {
	readonly id: string;
	readonly sourceId: string;
	readonly scope: ConsolidationSourceScope;
	readonly path: string;
	readonly digest: string;
	readonly kind: ConsolidationSourceKind;
	readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ConsolidationSourceCollectOptions {
	readonly limit: number;
	readonly maxCorpusRecordBytes: number;
	readonly maxCorpusBytes: number;
	readonly maxEpisodeRecordBytes: number;
	readonly maxEpisodeBytes: number;
	readonly representedKeys?: readonly string[];
	readonly signal?: AbortSignal;
}

interface ConsolidationSourceDecline {
	readonly code:
		| "source-record-bytes-deferred"
		| "source-aggregate-bytes-deferred";
	readonly path: string;
	readonly reason: string;
}

export interface ConsolidationSourceSnapshot {
	readonly records: readonly ConsolidationSourceRecord[];
	readonly inventory?: readonly ConsolidationSourceInventoryRecord[];
	readonly omitted: number;
	readonly declines?: readonly ConsolidationSourceDecline[];
}

export interface ConsolidationFinalizedRecord {
	readonly id: string;
	readonly digest: string;
	readonly proposalPaths: readonly string[];
	readonly fileIdentity?: {
		readonly device: string;
		readonly inode: string;
	};
}

export interface ConsolidationSource {
	readonly id: string;
	collect(
		options: ConsolidationSourceCollectOptions,
	): Promise<ConsolidationSourceSnapshot>;
	finalize?(
		represented: readonly ConsolidationFinalizedRecord[],
	): Promise<readonly string[]>;
}

export interface CollectedConsolidationSources {
	readonly records: readonly ConsolidationSourceRecord[];
	readonly inventory: readonly ConsolidationSourceInventoryRecord[];
	readonly sources: readonly {
		readonly sourceId: string;
		readonly admitted: number;
		readonly omitted: number;
	}[];
	readonly declines: readonly ConsolidationSourceDecline[];
}

export class ConsolidationSourceContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConsolidationSourceContractError";
	}
}

const PROJECT_EPISODE_SOURCE_ID = "project-episodes";
const PROJECT_CORPUS_SOURCE_ID = "project-corpus";
const PROJECT_EPISODE_DIRECTORY = "memory/agent/episodes";
const PROPOSAL_DIRECTORY = "memory/agent/proposals";

/** Project and user knowledge enter consolidation through the knowledge store. */
export function createProjectCorpusConsolidationSource(options: {
	readonly projectRoot: string;
	readonly userCosmonautsRoot: string;
}): ConsolidationSource {
	const projectRoot = resolve(options.projectRoot);
	const userCosmonautsRoot = resolve(options.userCosmonautsRoot);
	const store = createKnowledgeMemoryStore({
		projectRoot,
		userCosmonautsRoot,
	});
	return {
		id: PROJECT_CORPUS_SOURCE_ID,
		async collect(input) {
			throwIfAborted(input.signal);
			const retrieved = await store.retrieve(
				{ projectRoot, scopes: ["project", "user"] },
				{},
			);
			const candidates = retrieved.records
				.flatMap((record) =>
					record.scope === "project" || record.scope === "user"
						? [
								{
									record,
									scope: record.scope,
									scopeRoot:
										record.scope === "project"
											? projectRoot
											: userCosmonautsRoot,
								},
							]
						: [],
				)
				.toSorted((left, right) => {
					const leftPath = relativeScopePath(left.scopeRoot, left.record.path);
					const rightPath = relativeScopePath(
						right.scopeRoot,
						right.record.path,
					);
					return (
						right.record.timestamp.localeCompare(left.record.timestamp) ||
						`${left.scope}\0${leftPath}`.localeCompare(
							`${right.scope}\0${rightPath}`,
						)
					);
				});
			const records: ConsolidationSourceRecord[] = [];
			const inventory: ConsolidationSourceInventoryRecord[] = [];
			const declines: ConsolidationSourceDecline[] = [];
			const representedKeys = new Set(input.representedKeys);
			let projectCandidates = 0;
			let admittedBytes = 0;
			for (const candidate of candidates) {
				throwIfAborted(input.signal);
				const path = relativeScopePath(
					candidate.scopeRoot,
					candidate.record.path,
				);
				const content = await readRegularText(candidate.record.path);
				const common = Object.freeze({
					id: path,
					sourceId: PROJECT_CORPUS_SOURCE_ID,
					scope: candidate.scope,
					path,
					digest: sha256(content),
					kind: "knowledge" as const,
					metadata: corpusMetadata(candidate.record, candidate.scopeRoot),
				});
				inventory.push(common);
				if (
					candidate.scope !== "project" ||
					representedKeys.has(consolidationEvidenceKey(common))
				) {
					continue;
				}
				projectCandidates += 1;
				const contentBytes = Buffer.byteLength(content, "utf-8");
				if (contentBytes > input.maxCorpusRecordBytes) {
					declines.push({
						code: "source-record-bytes-deferred",
						path,
						reason: `Corpus record requires ${contentBytes.toLocaleString("en-US")} bytes; the per-record ceiling is ${input.maxCorpusRecordBytes.toLocaleString("en-US")} bytes.`,
					});
					continue;
				}
				if (records.length >= input.limit) continue;
				if (admittedBytes + contentBytes > input.maxCorpusBytes) {
					declines.push({
						code: "source-aggregate-bytes-deferred",
						path,
						reason: `Corpus aggregate body ceiling is ${input.maxCorpusBytes.toLocaleString("en-US")} bytes.`,
					});
					continue;
				}
				admittedBytes += contentBytes;
				records.push(Object.freeze({ ...common, content }));
			}
			return Object.freeze({
				records: Object.freeze(records),
				inventory: Object.freeze(inventory),
				omitted: projectCandidates - records.length,
				declines: Object.freeze(declines),
			});
		},
	};
}

/** Project episodes enter only through a configured knowledge consolidator. */
export function createProjectEpisodeConsolidationSource(options: {
	readonly projectRoot: string;
	readonly durableFiles?: DurableMachineFiles;
}): ConsolidationSource {
	const projectRoot = resolve(options.projectRoot);
	const durableFiles = options.durableFiles ?? createDurableMachineFiles();
	const store = createMarkdownMemoryStore({
		projectRoot,
		userCosmonautsRoot: projectRoot,
	});
	return {
		id: PROJECT_EPISODE_SOURCE_ID,
		async collect(input) {
			throwIfAborted(input.signal);
			const retrieved = await store.retrieve(
				{ projectRoot, scopes: ["project"] },
				{ recordTypes: ["episode"] },
			);
			const candidates = retrieved.records.toSorted((left, right) =>
				left.path.localeCompare(right.path),
			);
			const admitted = candidates.slice(0, input.limit);
			const records: ConsolidationSourceRecord[] = [];
			for (const record of admitted) {
				throwIfAborted(input.signal);
				const path = relativeProjectPath(projectRoot, record.path);
				assertDirectProjectEpisodePath(path);
				const snapshot = await readRegularTextSnapshot(record.path);
				const content = snapshot.content;
				records.push({
					id: path,
					sourceId: PROJECT_EPISODE_SOURCE_ID,
					scope: "project",
					path,
					digest: sha256(content),
					kind: "episode",
					content,
					fileIdentity: snapshot.identity,
					metadata: Object.freeze({
						type: record.type,
						title: record.title,
						description: record.description,
						timestamp: record.timestamp,
						tags: Object.freeze([...record.tags]),
						...(record.source === undefined ? {} : { source: record.source }),
					}),
				});
			}
			return Object.freeze({
				records: Object.freeze(records),
				omitted: candidates.length - admitted.length,
			});
		},
		async finalize(represented) {
			const pruned: string[] = [];
			for (const item of represented) {
				assertDirectProjectEpisodePath(item.id);
				if (!/^[a-f0-9]{64}$/u.test(item.digest)) {
					throw new ConsolidationSourceContractError(
						`Episode ${item.id} has an invalid finalization digest.`,
					);
				}
				if (item.proposalPaths.length === 0) {
					throw new ConsolidationSourceContractError(
						`Episode ${item.id} has no durable proposal representation.`,
					);
				}
				if (item.fileIdentity === undefined) {
					throw new ConsolidationSourceContractError(
						`Episode ${item.id} has no collected file identity.`,
					);
				}
				for (const proposalPath of new Set(item.proposalPaths)) {
					await assertContainedProposalPath(projectRoot, proposalPath);
					const proposal = await readRegularText(proposalPath);
					await durableFiles.writeText({
						path: proposalPath,
						content: proposal,
					});
					if ((await readRegularText(proposalPath)) !== proposal) {
						throw new ConsolidationSourceContractError(
							`Episode proposal representation changed during durability confirmation: ${proposalPath}.`,
						);
					}
				}

				const episodePath = resolve(projectRoot, ...item.id.split("/"));
				const snapshot = await readRegularTextSnapshotIfExists(episodePath);
				if (
					snapshot === undefined ||
					!sameFileIdentity(snapshot.identity, item.fileIdentity) ||
					sha256(snapshot.content) !== item.digest
				) {
					continue;
				}
				await durableFiles.removeFile(episodePath);
				pruned.push(item.id);
			}
			return Object.freeze(pruned);
		},
	};
}

export async function collectConsolidationSources(options: {
	readonly sources: readonly ConsolidationSource[];
	readonly maxCorpusRecords: number;
	readonly maxCorpusRecordBytes: number;
	readonly maxCorpusBytes: number;
	readonly maxEpisodeRecords: number;
	readonly maxEpisodeRecordBytes: number;
	readonly maxEpisodeBytes: number;
	readonly representedKeys?: readonly string[];
	readonly signal?: AbortSignal;
}): Promise<CollectedConsolidationSources> {
	const records: ConsolidationSourceRecord[] = [];
	const inventory: ConsolidationSourceInventoryRecord[] = [];
	const summaries: Array<{
		sourceId: string;
		admitted: number;
		omitted: number;
	}> = [];
	const declines: ConsolidationSourceDecline[] = [];
	const sourceIds = new Set<string>();
	const recordKeys = new Set<string>();
	let admittedCorpus = 0;
	let admittedCorpusBytes = 0;
	let admittedEpisodes = 0;
	let admittedEpisodeBytes = 0;
	const requestedLimit = Math.max(
		options.maxCorpusRecords,
		options.maxEpisodeRecords,
	);

	for (const source of options.sources) {
		throwIfAborted(options.signal);
		assertNonEmptyString(source.id, "Source id");
		if (sourceIds.has(source.id)) {
			throw new ConsolidationSourceContractError(
				`Duplicate source ids are not supported: ${source.id}.`,
			);
		}
		sourceIds.add(source.id);

		const snapshot = await source.collect({
			limit: requestedLimit,
			maxCorpusRecordBytes: options.maxCorpusRecordBytes,
			maxCorpusBytes: options.maxCorpusBytes,
			maxEpisodeRecordBytes: options.maxEpisodeRecordBytes,
			maxEpisodeBytes: options.maxEpisodeBytes,
			...(options.representedKeys === undefined
				? {}
				: { representedKeys: options.representedKeys }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
		if (!Number.isSafeInteger(snapshot.omitted) || snapshot.omitted < 0) {
			throw new ConsolidationSourceContractError(
				`Source ${source.id} returned an invalid omitted count.`,
			);
		}
		if (snapshot.records.length > requestedLimit) {
			throw new ConsolidationSourceContractError(
				`Source ${source.id} returned over-limit output (${snapshot.records.length} > ${requestedLimit}).`,
			);
		}
		const sourceInventory = snapshot.inventory?.map((candidate) =>
			immutableValidatedInventoryRecord(candidate, source.id),
		);

		let admitted = 0;
		let deferred = 0;
		const validatedSourceRecords: ConsolidationSourceRecord[] = [];
		for (const candidate of snapshot.records) {
			const record = immutableValidatedRecord(candidate, source.id);
			const contentBytes = Buffer.byteLength(record.content, "utf-8");
			const recordByteLimit =
				record.kind === "episode"
					? options.maxEpisodeRecordBytes
					: options.maxCorpusRecordBytes;
			if (contentBytes > recordByteLimit) {
				throw new ConsolidationSourceContractError(
					`Record ${record.id} exceeds the ${record.kind === "episode" ? "episode" : "corpus"} record ceiling (${recordByteLimit.toLocaleString("en-US")} bytes).`,
				);
			}
			const aggregateBytes =
				record.kind === "episode"
					? admittedEpisodeBytes + contentBytes
					: admittedCorpusBytes + contentBytes;
			const aggregateByteLimit =
				record.kind === "episode"
					? options.maxEpisodeBytes
					: options.maxCorpusBytes;
			if (aggregateBytes > aggregateByteLimit) {
				throw new ConsolidationSourceContractError(
					`${record.kind === "episode" ? "Episode" : "Corpus"} aggregate body bytes exceed the per-pass ceiling (${aggregateByteLimit.toLocaleString("en-US")} bytes).`,
				);
			}
			validatedSourceRecords.push(record);
			const key = `${record.sourceId}\0${record.id}`;
			if (recordKeys.has(key)) {
				throw new ConsolidationSourceContractError(
					`Source ${source.id} returned duplicate ids: ${record.id}.`,
				);
			}
			recordKeys.add(key);

			if (record.scope !== "project") continue;
			const isEpisode = record.kind === "episode";
			const hasCapacity = isEpisode
				? admittedEpisodes < options.maxEpisodeRecords
				: admittedCorpus < options.maxCorpusRecords;
			if (!hasCapacity) {
				deferred += 1;
				continue;
			}
			if (isEpisode) {
				admittedEpisodes += 1;
				admittedEpisodeBytes += contentBytes;
			} else {
				admittedCorpus += 1;
				admittedCorpusBytes += contentBytes;
			}
			records.push(record);
			admitted += 1;
		}

		inventory.push(
			...(sourceInventory ??
				validatedSourceRecords.map(
					({ content: _content, ...record }) => record,
				)),
		);
		declines.push(...(snapshot.declines ?? []));
		summaries.push(
			Object.freeze({
				sourceId: source.id,
				admitted,
				omitted: snapshot.omitted + deferred,
			}),
		);
	}

	return Object.freeze({
		records: Object.freeze(records),
		inventory: Object.freeze(inventory),
		sources: Object.freeze(summaries),
		declines: Object.freeze(declines),
	});
}

function immutableValidatedInventoryRecord(
	candidate: ConsolidationSourceInventoryRecord,
	sourceId: string,
): ConsolidationSourceInventoryRecord {
	assertNonEmptyString(candidate.id, "Inventory record id");
	if (candidate.sourceId !== sourceId) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} source-id mismatch: expected ${sourceId}.`,
		);
	}
	if (!CONSOLIDATION_SOURCE_SCOPES.includes(candidate.scope)) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} has unsupported scopes data: ${String(candidate.scope)}.`,
		);
	}
	if (!CONSOLIDATION_SOURCE_KINDS.includes(candidate.kind)) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} has an unsupported kind: ${String(candidate.kind)}.`,
		);
	}
	if (!isSafePosixRelativePath(candidate.path)) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} has unsafe paths data: ${candidate.path}.`,
		);
	}
	if (!/^[a-f0-9]{64}$/.test(candidate.digest)) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} has invalid digests data.`,
		);
	}
	if (
		typeof candidate.metadata !== "object" ||
		candidate.metadata === null ||
		Array.isArray(candidate.metadata)
	) {
		throw new ConsolidationSourceContractError(
			`Inventory record ${candidate.id} has invalid metadata.`,
		);
	}
	return Object.freeze({
		...candidate,
		metadata: deepFreeze(structuredClone(candidate.metadata)),
	});
}

function immutableValidatedRecord(
	candidate: ConsolidationSourceRecord,
	sourceId: string,
): ConsolidationSourceRecord {
	assertNonEmptyString(candidate.id, "Record id");
	if (candidate.sourceId !== sourceId) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} source-id mismatch: expected ${sourceId}.`,
		);
	}
	if (!CONSOLIDATION_SOURCE_SCOPES.includes(candidate.scope)) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has unsupported scopes data: ${String(candidate.scope)}.`,
		);
	}
	if (!CONSOLIDATION_SOURCE_KINDS.includes(candidate.kind)) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has an unsupported kind: ${String(candidate.kind)}.`,
		);
	}
	if (!isSafePosixRelativePath(candidate.path)) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has unsafe paths data: ${candidate.path}.`,
		);
	}
	if (
		!/^[a-f0-9]{64}$/.test(candidate.digest) ||
		sha256(candidate.content) !== candidate.digest
	) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has invalid digests data.`,
		);
	}
	if (
		typeof candidate.metadata !== "object" ||
		candidate.metadata === null ||
		Array.isArray(candidate.metadata)
	) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has invalid metadata.`,
		);
	}

	let metadata: Readonly<Record<string, unknown>>;
	try {
		metadata = deepFreeze(structuredClone(candidate.metadata));
	} catch (error: unknown) {
		throw new ConsolidationSourceContractError(
			`Record ${candidate.id} has invalid metadata: ${error instanceof Error ? error.message : String(error)}.`,
		);
	}

	return Object.freeze({
		id: candidate.id,
		sourceId: candidate.sourceId,
		scope: candidate.scope,
		path: candidate.path,
		digest: candidate.digest,
		kind: candidate.kind,
		content: candidate.content,
		metadata,
		...(candidate.fileIdentity === undefined
			? {}
			: {
					fileIdentity: validatedFileIdentity(
						candidate.fileIdentity,
						candidate.id,
					),
				}),
	});
}

function validatedFileIdentity(
	identity: { readonly device: string; readonly inode: string },
	recordId: string,
): { readonly device: string; readonly inode: string } {
	if (identity.device.length === 0 || identity.inode.length === 0) {
		throw new ConsolidationSourceContractError(
			`Record ${recordId} has an invalid file identity.`,
		);
	}
	return Object.freeze({ ...identity });
}

function relativeProjectPath(projectRoot: string, path: string): string {
	const value = relativeScopePath(projectRoot, path);
	return value;
}

function relativeScopePath(scopeRoot: string, path: string): string {
	const value = relative(scopeRoot, resolve(path)).split(sep).join("/");
	if (!isSafePosixRelativePath(value)) {
		throw new ConsolidationSourceContractError(
			`Source path escapes its scope: ${path}.`,
		);
	}
	return value;
}

function corpusMetadata(
	record: RetrievedMemoryRecord,
	scopeRoot: string,
): Readonly<Record<string, unknown>> {
	const optional = record as RetrievedMemoryRecord & {
		readonly retireWhen?: unknown;
		readonly files?: unknown;
	};
	return deepFreeze({
		type: record.type,
		title: record.title,
		description: record.description,
		resource: record.resource,
		timestamp: record.timestamp,
		tags: [...record.tags],
		scopeRoot,
		...(optional.retireWhen === undefined
			? {}
			: { retireWhen: optional.retireWhen }),
		...(optional.files === undefined ? {} : { files: optional.files }),
	});
}

function assertDirectProjectEpisodePath(path: string): void {
	if (
		!isSafePosixRelativePath(path) ||
		posix.dirname(path) !== PROJECT_EPISODE_DIRECTORY ||
		!posix.basename(path).endsWith(".md")
	) {
		throw new ConsolidationSourceContractError(
			`Episode path is not a direct project episode: ${path}.`,
		);
	}
}

async function assertContainedProposalPath(
	projectRoot: string,
	path: string,
): Promise<void> {
	const proposalRoot = resolve(projectRoot, ...PROPOSAL_DIRECTORY.split("/"));
	const candidate = resolve(path);
	if (!isContained(proposalRoot, candidate)) {
		throw new ConsolidationSourceContractError(
			`Episode proposal representation is outside the project proposal root: ${path}.`,
		);
	}
	const [realProposalRoot, realCandidate] = await Promise.all([
		realpath(proposalRoot),
		realpath(candidate),
	]);
	if (!isContained(realProposalRoot, realCandidate)) {
		throw new ConsolidationSourceContractError(
			`Episode proposal representation escapes its real root: ${path}.`,
		);
	}
}

function isContained(root: string, candidate: string): boolean {
	const path = relative(root, candidate);
	return (
		path.length > 0 &&
		!path.startsWith(`..${sep}`) &&
		path !== ".." &&
		!isAbsolute(path)
	);
}

async function readRegularText(path: string): Promise<string> {
	const snapshot = await readRegularTextSnapshotIfExists(path);
	if (snapshot === undefined) {
		throw new ConsolidationSourceContractError(
			`Episode disappeared while collecting: ${path}.`,
		);
	}
	return snapshot.content;
}

async function readRegularTextSnapshot(path: string): Promise<{
	readonly content: string;
	readonly identity: { readonly device: string; readonly inode: string };
}> {
	const snapshot = await readRegularTextSnapshotIfExists(path);
	if (snapshot === undefined) {
		throw new ConsolidationSourceContractError(
			`Episode disappeared while collecting: ${path}.`,
		);
	}
	return snapshot;
}

async function readRegularTextSnapshotIfExists(path: string): Promise<
	| {
			readonly content: string;
			readonly identity: { readonly device: string; readonly inode: string };
	  }
	| undefined
> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat({ bigint: true });
			if (!metadata.isFile()) {
				throw new ConsolidationSourceContractError(
					`Episode is not a regular no-follow file: ${path}.`,
				);
			}
			return Object.freeze({
				content: await handle.readFile("utf-8"),
				identity: Object.freeze({
					device: String(metadata.dev),
					inode: String(metadata.ino),
				}),
			});
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

function sameFileIdentity(
	left: { readonly device: string; readonly inode: string },
	right: { readonly device: string; readonly inode: string },
): boolean {
	return left.device === right.device && left.inode === right.inode;
}

function assertNonEmptyString(value: string, label: string): void {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new ConsolidationSourceContractError(`${label} must be non-empty.`);
	}
}

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new Error("Living-memory consolidation was cancelled.");
	}
}

function errorCode(error: unknown): string | undefined {
	return error !== null && typeof error === "object" && "code" in error
		? String((error as NodeJS.ErrnoException).code)
		: undefined;
}
