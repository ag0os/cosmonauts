export const MEMORY_SCOPES = ["session", "project", "user"] as const;
export type MemoryScopeName = (typeof MEMORY_SCOPES)[number];

export const MEMORY_KINDS = ["semantic", "procedural", "episodic"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryScopeContext {
	readonly projectRoot: string;
	readonly scopes: readonly MemoryScopeName[];
	readonly sessionId?: string;
}

export interface MemoryRecordDraft {
	/** W1 authored records use "note"; derived adapters may reject writes. */
	readonly type: string;
	readonly scope: MemoryScopeName;
	readonly kind: MemoryKind;
	readonly title: string;
	readonly description: string;
	readonly content: string;
	readonly tags: readonly string[];
	readonly timestamp?: string;
	readonly source?: string;
}

export interface MemoryQuery {
	readonly text?: string;
	readonly recordTypes?: readonly string[];
	readonly resource?: string;
	readonly limit?: number;
}

export interface RetrievedMemoryRecord {
	readonly type: string;
	readonly scope: MemoryScopeName;
	readonly kind?: MemoryKind;
	readonly title: string;
	readonly description: string;
	readonly resource: string;
	readonly tags: readonly string[];
	readonly timestamp: string;
	readonly content: string;
	readonly path: string;
}

export interface MemoryWarning {
	readonly path?: string;
	readonly message: string;
}

export interface MemorySkippedScope {
	readonly scope: MemoryScopeName;
	readonly reason: string;
}

/**
 * Scan-cost observations for one retrieve call. The per-turn full-rescan
 * stance is ratified without a cache; the reassess gate revisits it on
 * measured numbers, which these provide.
 */
export interface MemoryRetrieveStats {
	/** Record files whose content was read from disk, including unparsable ones. */
	readonly filesScanned: number;
	/** Total UTF-8 bytes of the scanned files. */
	readonly bytesRead: number;
	/** Wall-clock duration of the retrieve call in milliseconds. */
	readonly durationMs: number;
}

export interface MemoryRetrieveResult {
	readonly records: readonly RetrievedMemoryRecord[];
	readonly searchedScopes: readonly MemoryScopeName[];
	readonly skippedScopes: readonly MemorySkippedScope[];
	readonly warnings: readonly MemoryWarning[];
	readonly stats?: MemoryRetrieveStats;
	readonly details?: unknown;
}

export type MemoryWriteResult =
	| {
			readonly kind: "written";
			readonly path: string;
			readonly record: RetrievedMemoryRecord;
	  }
	| { readonly kind: "unsupported"; readonly reason: string }
	| {
			readonly kind: "failed";
			readonly reason: string;
			readonly path?: string;
	  };

export type MemoryConsolidateResult = {
	readonly kind: "noop";
	readonly reason: string;
};

export interface MemoryStore {
	write(record: MemoryRecordDraft): Promise<MemoryWriteResult>;
	retrieve(
		scope: MemoryScopeContext,
		query: MemoryQuery,
	): Promise<MemoryRetrieveResult>;
	consolidate(): Promise<MemoryConsolidateResult>;
}
