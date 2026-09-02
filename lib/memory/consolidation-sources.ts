import { createHash } from "node:crypto";
import { isAbsolute, posix } from "node:path";

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
