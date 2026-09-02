import type { withEntityFileLock } from "../entity-file-lock.ts";
import type {
	ConsolidationSource,
	ConsolidationSourceRecord,
} from "./consolidation-sources.ts";

export const MEMORY_SCOPES = ["session", "project", "user"] as const;
export type MemoryScopeName = (typeof MEMORY_SCOPES)[number];

export const MEMORY_KINDS = ["semantic", "procedural", "episodic"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryScopeContext {
	readonly projectRoot: string;
	readonly scopes: readonly MemoryScopeName[];
	readonly sessionId?: string;
}

export interface KnowledgeProposalIdentity {
	readonly planSlug: string;
	readonly key: string;
	readonly sourceDate?: string;
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
	readonly resource?: string;
	readonly writer?: string;
	readonly source?: string;
	readonly date?: string;
	readonly proposalIdentity?: KnowledgeProposalIdentity;
}

export interface MemoryQuery {
	readonly text?: string;
	readonly recordTypes?: readonly string[];
	readonly resource?: string;
	readonly limit?: number;
	readonly includeRetired?: boolean;
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
	readonly writer?: string;
	readonly source?: string;
	readonly date?: string;
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

export type ConsolidationModelMode = "full" | "deterministic-only";

export type ConsolidationRecovery =
	| "none"
	| "pending"
	| "rolled-back"
	| "rolled-forward"
	| "release-unconfirmed"
	| "concurrent-mutation";

export interface MemoryConsolidateOptions {
	readonly dryRun?: boolean;
	readonly modelMode?: ConsolidationModelMode;
	readonly signal?: AbortSignal;
}

export interface ConsolidationEvidenceRef {
	readonly id: string;
	readonly sourceId: string;
	readonly scope: "project" | "user";
	readonly path: string;
	readonly digest: string;
}

export type ConsolidationObservationKind =
	| "duplicate"
	| "superseded"
	| "stale-reference"
	| "merge-candidate"
	| "retire-condition-met"
	| "obsolete-cause"
	| "improvement";

export interface ConsolidationObservation {
	readonly id: string;
	readonly kind: ConsolidationObservationKind;
	readonly inputs: readonly ConsolidationEvidenceRef[];
	readonly reason: string;
}

export interface ConsolidationProposalView {
	readonly proposalKind: "create" | "merge" | "retire" | "improve";
	readonly key: string;
	readonly path?: string;
	readonly inputs: readonly ConsolidationEvidenceRef[];
	readonly contentDigest: string;
	readonly status: "preview" | "written" | "existing";
}

export interface MemoryConsolidateDetails {
	readonly dryRun: boolean;
	readonly modelMode: ConsolidationModelMode;
	readonly sources: readonly {
		readonly sourceId: string;
		readonly admitted: number;
		readonly omitted: number;
	}[];
	readonly observations: readonly ConsolidationObservation[];
	readonly proposals: readonly ConsolidationProposalView[];
	readonly retirements: readonly {
		readonly path: string;
		readonly digest: string;
		readonly status: "preview" | "applied" | "blocked" | "deferred";
		readonly reason: string;
	}[];
	readonly episodePrunes: readonly string[];
	readonly acceptedJudgmentReceiptPath?: string;
	readonly manifestPath?: string;
	readonly declines: readonly {
		readonly code: string;
		readonly path?: string;
		readonly reason: string;
	}[];
	readonly warnings: readonly MemoryWarning[];
	readonly recovery: ConsolidationRecovery;
	readonly writesCommitted: boolean;
}

export type MemoryConsolidateResult =
	| {
			readonly kind: "noop";
			readonly reason: string;
			readonly details?: MemoryConsolidateDetails;
	  }
	| { readonly kind: "ran"; readonly details: MemoryConsolidateDetails }
	| {
			readonly kind: "failed";
			readonly reason: string;
			readonly details?: MemoryConsolidateDetails;
	  };

export type KnowledgeConsolidator = (
	options?: MemoryConsolidateOptions,
) => Promise<MemoryConsolidateResult>;

export interface LivingMemoryLimits {
	readonly maxCorpusRecords: number;
	/** Maximum UTF-8 bytes admitted for one corpus record (64 KiB). */
	readonly maxCorpusRecordBytes: number;
	/** Maximum aggregate UTF-8 corpus body bytes admitted per pass (256 KiB). */
	readonly maxCorpusBytes: number;
	readonly maxEpisodeRecords: number;
	/** Maximum UTF-8 bytes admitted for one episode (64 KiB). */
	readonly maxEpisodeRecordBytes: number;
	/** Maximum aggregate UTF-8 episode body bytes admitted per pass (256 KiB). */
	readonly maxEpisodeBytes: number;
	readonly maxObservations: number;
	readonly maxProposals: number;
	readonly maxRetirements: number;
	readonly maxModelRequests: number;
}

export interface ProposedMemoryRecord {
	readonly type: "decision" | "trade-off" | "gotcha" | "convention" | "note";
	readonly title: string;
	readonly description: string;
	readonly content: string;
	readonly tags: readonly string[];
}

export type JudgedProposal =
	| {
			readonly proposalKind: "create";
			readonly record: ProposedMemoryRecord;
	  }
	| {
			readonly proposalKind: "merge";
			readonly replacement: ProposedMemoryRecord;
	  }
	| {
			readonly proposalKind: "retire";
			readonly reason: "superseded" | "merged" | "obsolete" | "retire-when-met";
	  }
	| {
			readonly proposalKind: "improve";
			readonly observedProblem: string;
			readonly whatHappened: string;
			readonly suggestedImprovement: string;
			readonly whyItHelps: string;
	  };

export interface CorpusJudgmentInput {
	readonly schemaVersion: 1;
	readonly batchKey: string;
	readonly records: readonly ConsolidationSourceRecord[];
	readonly deterministicObservations: readonly ConsolidationObservation[];
	readonly limits: LivingMemoryLimits;
}

export interface CorpusJudgmentOutput {
	readonly schemaVersion: 1;
	readonly observations: readonly {
		readonly kind: ConsolidationObservationKind;
		readonly inputIds: readonly string[];
		readonly reason: string;
		readonly proposal?: JudgedProposal;
	}[];
}

export interface CorpusJudgmentProvider {
	readonly id: string;
	judge(
		input: CorpusJudgmentInput,
		options: { readonly signal?: AbortSignal },
	): Promise<CorpusJudgmentOutput>;
}

export interface KnowledgeIndexPressureResult {
	readonly targetSatisfied: boolean;
	readonly recordCount: number;
	readonly maxRecords: number;
	readonly renderedBytes: number;
	readonly guaranteedBytes: number;
	readonly headroomBytes: number;
}

export interface KnowledgeIndexPressurePolicy {
	measure(
		records: readonly RetrievedMemoryRecord[],
	): KnowledgeIndexPressureResult;
}

export interface ConsolidationProposalStore {
	readEvidence(): Promise<readonly ConsolidationEvidenceRef[]>;
	persist(options: {
		readonly batchKey: string;
		readonly observation: ConsolidationObservation;
		readonly proposal: JudgedProposal;
		readonly dryRun: boolean;
		readonly signal?: AbortSignal;
	}): Promise<ConsolidationProposalView>;
}

export type ImprovementActionPointer =
	| { readonly kind: "roadmap"; readonly value: string }
	| { readonly kind: "task"; readonly value: string }
	| { readonly kind: "prompt"; readonly value: string }
	| { readonly kind: "skill"; readonly value: string };

export type ImproveProposalResolution =
	| { readonly kind: "actioned"; readonly pointer: ImprovementActionPointer }
	| { readonly kind: "rejected"; readonly reason: string };

export interface ImproveProposalResolutionResult {
	readonly kind: "actioned" | "rejected";
	readonly status: "closed";
	readonly proposalPath: string;
	readonly historyPath: string;
	readonly existing: boolean;
}

export interface ImproveProposalResolver {
	resolve(options: {
		readonly proposalPath: string;
		readonly resolution: ImproveProposalResolution;
		readonly date: Date;
		readonly lockOptions: LivingMemoryLockOptions;
		readonly signal?: AbortSignal;
	}): Promise<ImproveProposalResolutionResult>;
}

export interface AcceptedJudgmentReceipt {
	readonly schemaVersion: 1;
	readonly batchKey: string;
	readonly state: "accepted" | "materialized";
	readonly inputDigests: readonly string[];
	readonly inputs?: readonly ConsolidationEvidenceRef[];
	readonly output: CorpusJudgmentOutput;
	readonly path: string;
}

export interface AcceptedJudgmentReceiptStore {
	pathFor(batchKey: string): string;
	list(): Promise<readonly AcceptedJudgmentReceipt[]>;
	dischargeStale(options: {
		readonly currentKeys: readonly string[];
		readonly lockOptions: LivingMemoryLockOptions;
		readonly lockHeld?: boolean;
	}): Promise<readonly string[]>;
	read(batchKey: string): Promise<AcceptedJudgmentReceipt | undefined>;
	write(receipt: AcceptedJudgmentReceipt): Promise<AcceptedJudgmentReceipt>;
	markMaterialized(batchKey: string): Promise<AcceptedJudgmentReceipt>;
}

export interface LivingMemoryRetirementInspection {
	readonly recovery: ConsolidationRecovery;
	readonly warnings: readonly MemoryWarning[];
	readonly representedKeys: readonly string[];
	readonly snapshot?: string;
}

export type LivingMemoryRetirementReason =
	| "superseded"
	| "merged"
	| "obsolete"
	| "retire-when-met";

export interface LivingMemoryRetirementCandidate {
	readonly record: ConsolidationSourceRecord;
	readonly reason: LivingMemoryRetirementReason;
	readonly evidence: readonly ConsolidationEvidenceRef[];
	readonly evidenceReason: string;
}

export interface LivingMemoryRetirementRunDetails {
	readonly retirements: MemoryConsolidateDetails["retirements"];
	readonly declines: MemoryConsolidateDetails["declines"];
	readonly warnings: readonly MemoryWarning[];
	readonly recovery: ConsolidationRecovery;
	readonly writesCommitted: boolean;
	readonly manifestPath?: string;
}

export type LivingMemoryRetirementRunResult =
	| {
			readonly kind: "completed";
			readonly details: LivingMemoryRetirementRunDetails;
	  }
	| {
			readonly kind: "failed";
			readonly reason: string;
			readonly details: LivingMemoryRetirementRunDetails;
	  };

export interface LivingMemoryRetirementStore {
	inspect(
		records: readonly ConsolidationSourceRecord[],
		options?: { readonly lockHeld?: boolean },
	): Promise<LivingMemoryRetirementInspection>;
	apply(options: {
		readonly candidates: readonly LivingMemoryRetirementCandidate[];
		readonly dryRun: boolean;
		readonly date: Date;
		readonly maxRetirements: number;
		readonly signal?: AbortSignal;
		readonly lockOptions: LivingMemoryLockOptions;
		readonly lockHeld?: boolean;
	}): Promise<LivingMemoryRetirementRunResult>;
}

export interface LivingMemoryRestorationStore {
	restore(options: {
		readonly path: string;
		readonly reason: string;
		readonly date: Date;
		readonly signal?: AbortSignal;
		readonly lockOptions: LivingMemoryLockOptions;
	}): Promise<LivingMemoryRestorationResult>;
}

export interface LivingMemoryRestorationDetails {
	readonly path: string;
	readonly digest?: string;
	readonly status?: "restored" | "existing";
	readonly manifestPath?: string;
	readonly recovery: ConsolidationRecovery;
	readonly writesCommitted: boolean;
}

export type LivingMemoryRestorationResult =
	| {
			readonly kind: "completed";
			readonly details: LivingMemoryRestorationDetails;
	  }
	| {
			readonly kind: "failed";
			readonly reason: string;
			readonly details: LivingMemoryRestorationDetails;
	  };

/** Slice 1 deliberately exposes durable writes but no source removal operation. */
export interface LivingMemoryDurableFiles {
	writeText(options: {
		readonly path: string;
		readonly content: string;
		readonly signal?: AbortSignal;
	}): Promise<{ readonly path: string; readonly digest: string }>;
}

export interface LivingMemoryLockOptions {
	readonly retryMs: number;
	readonly timeoutMs: number;
	readonly onReleaseUnconfirmed: (error: unknown) => void;
}

export interface LivingMemoryConsolidatorDependencies {
	readonly lockPath: string;
	readonly withLock: typeof withEntityFileLock;
	readonly sources: readonly ConsolidationSource[];
	readonly judgmentProvider?: CorpusJudgmentProvider;
	readonly proposalStore: ConsolidationProposalStore;
	readonly acceptedJudgmentReceiptStore: AcceptedJudgmentReceiptStore;
	readonly retirementStore: LivingMemoryRetirementStore;
	readonly durableFiles: LivingMemoryDurableFiles;
	readonly indexPressure: KnowledgeIndexPressurePolicy;
	readonly clock: () => Date;
	readonly limits: LivingMemoryLimits;
	readonly lockOptions: LivingMemoryLockOptions;
}

export interface MemoryStore {
	write(record: MemoryRecordDraft): Promise<MemoryWriteResult>;
	retrieve(
		scope: MemoryScopeContext,
		query: MemoryQuery,
	): Promise<MemoryRetrieveResult>;
	consolidate(
		options?: MemoryConsolidateOptions,
	): Promise<MemoryConsolidateResult>;
}
