/**
 * Type definitions for the sessions module.
 * Covers session lineage tracking and knowledge record formats.
 */

// ============================================================================
// Knowledge Types
// ============================================================================

/** Classification of the knowledge type */
export type KnowledgeType =
	| "decision"
	| "rationale"
	| "pattern"
	| "trade-off"
	| "gotcha"
	| "convention";

/** A single unit of distilled knowledge, ready for future DB ingestion */
export interface KnowledgeRecord {
	/** Unique record ID (UUID) */
	id: string;
	/** Plan that produced this knowledge */
	planSlug: string;
	/** Task ID if this knowledge came from a specific task's implementation */
	taskId?: string;
	/** Which agent role produced or surfaced this knowledge */
	sourceRole: string;
	/** Classification of the knowledge type */
	type: KnowledgeType;
	/** The knowledge itself — concise, self-contained, embeddable text.
	 *  This is the field that gets vectorized for semantic search. */
	content: string;
	/** File paths this knowledge relates to (for scoped retrieval) */
	files: string[];
	/** Free-form tags for categorical filtering */
	tags: string[];
	/** ISO 8601 timestamp */
	createdAt: string;
}

/** A collection of knowledge records from one plan's distillation */
export interface KnowledgeBundle {
	planSlug: string;
	planTitle: string;
	distilledAt: string;
	/** Agent role or "human" */
	distilledBy: string;
	records: KnowledgeRecord[];
}

// ============================================================================
// Session Lineage Types
// ============================================================================

/** A record of one agent session that participated in a plan's lifecycle */
export interface SessionRecord {
	sessionId: string;
	role: string;
	parentSessionId?: string;
	taskId?: string;
	/** ISO 8601 */
	startedAt: string;
	/** ISO 8601 */
	completedAt: string;
	outcome: "success" | "failed";
	/** Relative path, e.g. "planner-abc123.jsonl" */
	sessionFile: string;
	/** Relative path, e.g. "planner-abc123.transcript.md" */
	transcriptFile: string;
	stats?: {
		tokens: { input: number; output: number; total: number };
		cost: number;
		durationMs: number;
		turns: number;
		toolCalls: number;
	};
}

/** Manifest linking a plan to all sessions that participated in it */
export interface SessionManifest {
	planSlug: string;
	/** ISO 8601 */
	createdAt: string;
	/** ISO 8601 */
	updatedAt: string;
	sessions: SessionRecord[];
}
