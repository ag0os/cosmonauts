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
}

export interface ConsolidationSourceCollectOptions {
	readonly limit: number;
	readonly signal?: AbortSignal;
}

export interface ConsolidationSourceSnapshot {
	readonly records: readonly ConsolidationSourceRecord[];
	readonly omitted: number;
}

export interface ConsolidationFinalizedRecord {
	readonly id: string;
	readonly digest: string;
	readonly proposalPaths: readonly string[];
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
	readonly sources: readonly {
		readonly sourceId: string;
		readonly admitted: number;
		readonly omitted: number;
	}[];
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
			const admitted = candidates.slice(0, input.limit);
			const records: ConsolidationSourceRecord[] = [];
			for (const candidate of admitted) {
				throwIfAborted(input.signal);
				const path = relativeScopePath(
					candidate.scopeRoot,
					candidate.record.path,
				);
				const content = await readRegularText(candidate.record.path);
				records.push(
					Object.freeze({
						id: path,
						sourceId: PROJECT_CORPUS_SOURCE_ID,
						scope: candidate.scope,
						path,
						digest: sha256(content),
						kind: "knowledge",
						content,
						metadata: corpusMetadata(candidate.record, candidate.scopeRoot),
					}),
				);
			}
			return Object.freeze({
				records: Object.freeze(records),
				omitted: candidates.length - admitted.length,
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
				const content = await readRegularText(record.path);
				records.push({
					id: path,
					sourceId: PROJECT_EPISODE_SOURCE_ID,
					scope: "project",
					path,
					digest: sha256(content),
					kind: "episode",
					content,
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
				const content = await readRegularTextIfExists(episodePath);
				if (content === undefined || sha256(content) !== item.digest) continue;
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
	readonly maxEpisodeRecords: number;
	readonly signal?: AbortSignal;
}): Promise<CollectedConsolidationSources> {
	const records: ConsolidationSourceRecord[] = [];
	const summaries: Array<{
		sourceId: string;
		admitted: number;
		omitted: number;
	}> = [];
	const sourceIds = new Set<string>();
	const recordKeys = new Set<string>();
	let admittedCorpus = 0;
	let admittedEpisodes = 0;
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

		let admitted = 0;
		let deferred = 0;
		for (const candidate of snapshot.records) {
			const record = immutableValidatedRecord(candidate, source.id);
			const key = `${record.sourceId}\0${record.id}`;
			if (recordKeys.has(key)) {
				throw new ConsolidationSourceContractError(
					`Source ${source.id} returned duplicate ids: ${record.id}.`,
				);
			}
			recordKeys.add(key);

			const isEpisode = record.kind === "episode";
			const hasCapacity = isEpisode
				? admittedEpisodes < options.maxEpisodeRecords
				: admittedCorpus < options.maxCorpusRecords;
			if (!hasCapacity) {
				deferred += 1;
				continue;
			}
			if (isEpisode) admittedEpisodes += 1;
			else admittedCorpus += 1;
			records.push(record);
			admitted += 1;
		}

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
		sources: Object.freeze(summaries),
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
	if (!isSafeScopeRelativePath(candidate.path)) {
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
	});
}

function isSafeScopeRelativePath(value: string): boolean {
	if (
		value.length === 0 ||
		value.includes("\\") ||
		value.includes("\0") ||
		isAbsolute(value) ||
		/^[A-Za-z]:/.test(value)
	) {
		return false;
	}
	const segments = value.split("/");
	return (
		segments.every(
			(segment) => segment !== "" && segment !== "." && segment !== "..",
		) && posix.normalize(value) === value
	);
}

function relativeProjectPath(projectRoot: string, path: string): string {
	const value = relativeScopePath(projectRoot, path);
	return value;
}

function relativeScopePath(scopeRoot: string, path: string): string {
	const value = relative(scopeRoot, resolve(path)).split(sep).join("/");
	if (!isSafeScopeRelativePath(value)) {
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
		!isSafeScopeRelativePath(path) ||
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
	const content = await readRegularTextIfExists(path);
	if (content === undefined) {
		throw new ConsolidationSourceContractError(
			`Episode disappeared while collecting: ${path}.`,
		);
	}
	return content;
}

async function readRegularTextIfExists(
	path: string,
): Promise<string | undefined> {
	try {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const metadata = await handle.stat();
			if (!metadata.isFile()) {
				throw new ConsolidationSourceContractError(
					`Episode is not a regular no-follow file: ${path}.`,
				);
			}
			return await handle.readFile("utf-8");
		} finally {
			await handle.close();
		}
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
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
