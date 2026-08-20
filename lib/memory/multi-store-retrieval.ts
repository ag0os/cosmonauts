import type {
	MemoryQuery,
	MemoryRetrieveResult,
	MemoryRetrieveStats,
	MemoryScopeContext,
	MemoryStore,
	RetrievedMemoryRecord,
} from "./types.ts";

export interface MemoryRetrievalRequest {
	readonly key: string;
	readonly store: MemoryStore;
	readonly scope: MemoryScopeContext;
	readonly query: MemoryQuery;
}

export interface CombinedMemoryRetrieveResult extends MemoryRetrieveResult {
	readonly sources: Readonly<Record<string, MemoryRetrieveResult>>;
}

/**
 * Retrieve through explicit MemoryStore inputs, then sort and apply the visible
 * limit once. Matching profiles remain pinned outside that limit.
 */
export async function combineMemoryRetrieval(options: {
	readonly requests: readonly MemoryRetrievalRequest[];
	readonly limit?: number;
}): Promise<CombinedMemoryRetrieveResult> {
	assertUniqueKeys(options.requests);
	const startedAt = performance.now();
	const results = await Promise.all(
		options.requests.map(async (request) => ({
			key: request.key,
			result: await request.store.retrieve(request.scope, {
				...request.query,
				limit: undefined,
			}),
		})),
	);
	const records = results.flatMap(({ result }) => result.records);
	records.sort(compareRecords);
	const profiles = records.filter((record) => record.type === "profile");
	const visible = records.filter((record) => record.type !== "profile");
	const bounded =
		options.limit === undefined
			? visible
			: visible.slice(0, Math.max(0, options.limit));

	return {
		records: [...profiles, ...bounded],
		searchedScopes: unique(
			results.flatMap(({ result }) => result.searchedScopes),
		),
		skippedScopes: results.flatMap(({ result }) => result.skippedScopes),
		warnings: results.flatMap(({ result }) => result.warnings),
		stats: aggregateStats(
			results.map(({ result }) => result.stats),
			performance.now() - startedAt,
		),
		sources: Object.fromEntries(
			results.map(({ key, result }) => [key, result]),
		),
	};
}

function aggregateStats(
	stats: readonly (MemoryRetrieveStats | undefined)[],
	durationMs: number,
): MemoryRetrieveStats {
	return {
		filesScanned: stats.reduce(
			(total, value) => total + (value?.filesScanned ?? 0),
			0,
		),
		bytesRead: stats.reduce(
			(total, value) => total + (value?.bytesRead ?? 0),
			0,
		),
		durationMs,
	};
}

function compareRecords(
	left: RetrievedMemoryRecord,
	right: RetrievedMemoryRecord,
): number {
	return (
		right.timestamp.localeCompare(left.timestamp) ||
		left.path.localeCompare(right.path)
	);
}

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function assertUniqueKeys(requests: readonly MemoryRetrievalRequest[]): void {
	const keys = new Set<string>();
	for (const request of requests) {
		if (keys.has(request.key)) {
			throw new Error(`Duplicate memory retrieval key: ${request.key}`);
		}
		keys.add(request.key);
	}
}
