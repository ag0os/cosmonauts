/**
 * Type definitions for the sessions module.
 * Covers session lineage tracking.
 */

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
