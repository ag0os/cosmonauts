/**
 * ChainProfiler — collects timestamped events during a chain run, pairs tool
 * start/end events to compute durations, and writes structured output (JSONL
 * trace + human-readable summary) to files for post-run analysis.
 *
 * Depends only on lib/orchestration/types.ts and node:* modules.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChainEvent } from "./types.ts";

// ============================================================================
// Public Types
// ============================================================================

/** A single profiler trace entry — one JSONL line. Chrome-trace-inspired. */
export interface ProfileTraceEntry {
	/** Monotonic timestamp relative to chain start (ms) */
	ts: number;
	/** Event category */
	cat: "chain" | "stage" | "parallel" | "agent" | "tool" | "error";
	/** Event name — maps from ChainEvent.type */
	name: string;
	/** Phase: B=begin, E=end, I=instant */
	ph: "B" | "E" | "I";
	/** Disambiguator for parallel members sharing the same role name (e.g. "reviewer.0") */
	scope?: string;
	/** Payload — event-specific data */
	data?: Record<string, unknown>;
}

/** Computed tool invocation duration from paired start/end events. */
export interface ToolSpan {
	toolName: string;
	toolCallId: string;
	role: string;
	sessionId: string;
	startTs: number;
	endTs: number;
	durationMs: number;
	isError: boolean;
}

/** Options for constructing a ChainProfiler. */
export interface ChainProfilerOptions {
	/** Absolute path to the directory where output files are written. */
	outputDir: string;
}

// ============================================================================
// Internal Types
// ============================================================================

interface PendingTool {
	startTs: number;
	toolName: string;
	role: string;
	sessionId: string;
}

interface ParallelGroupState {
	/** stepIndex from parallel_start */
	stepIndex: number;
	/** Maps sessionId → scope tag (e.g. "reviewer.0") */
	sessionScopes: Map<string, string>;
	/** Role name → count of spawned members so far (for indexing) */
	roleCount: Map<string, number>;
	/** Wall-clock start timestamp (relative to chainStartTs) */
	startTs: number;
}

// ============================================================================
// ChainProfiler
// ============================================================================

export class ChainProfiler {
	private readonly outputDir: string;

	private chainStartTs: number | undefined = undefined;
	private readonly entries: ProfileTraceEntry[] = [];
	private readonly spans: ToolSpan[] = [];
	private readonly pendingTools = new Map<string, PendingTool>();

	/** Active parallel group (only one can be active at a time in the current model) */
	private activeParallelGroup: ParallelGroupState | undefined = undefined;

	/** Maps sessionId → scope tag for sessions inside a parallel group */
	private readonly sessionScopeMap = new Map<string, string>();

	constructor(options: ChainProfilerOptions) {
		this.outputDir = options.outputDir;
	}

	// --------------------------------------------------------------------------
	// Event Handler
	// --------------------------------------------------------------------------

	handleEvent(event: ChainEvent): void {
		const now = Date.now();

		if (event.type === "chain_start") {
			this.chainStartTs = now;
		}

		const ts = this.chainStartTs !== undefined ? now - this.chainStartTs : 0;

		switch (event.type) {
			case "chain_start":
				this.entries.push({
					ts,
					cat: "chain",
					name: "chain_start",
					ph: "B",
					data: { stepCount: event.steps.length },
				});
				break;

			case "chain_end":
				this.entries.push({
					ts,
					cat: "chain",
					name: "chain_end",
					ph: "E",
					data: { success: event.result.success },
				});
				break;

			case "stage_start":
				this.entries.push({
					ts,
					cat: "stage",
					name: event.stage.name,
					ph: "B",
					data: { stageIndex: event.stageIndex },
				});
				break;

			case "stage_end":
				this.entries.push({
					ts,
					cat: "stage",
					name: event.stage.name,
					ph: "E",
					data: {
						success: event.result.success,
						durationMs: event.result.durationMs,
					},
				});
				break;

			case "parallel_start": {
				const groupTs = ts;
				this.activeParallelGroup = {
					stepIndex: event.stepIndex,
					sessionScopes: new Map(),
					roleCount: new Map(),
					startTs: groupTs,
				};
				this.entries.push({
					ts,
					cat: "parallel",
					name: "parallel_start",
					ph: "B",
					data: { stepIndex: event.stepIndex },
				});
				break;
			}

			case "parallel_end":
				this.entries.push({
					ts,
					cat: "parallel",
					name: "parallel_end",
					ph: "E",
					data: {
						stepIndex: event.stepIndex,
						success: event.success,
					},
				});
				this.activeParallelGroup = undefined;
				break;

			case "agent_spawned": {
				const scope = this.assignScope(event.role, event.sessionId);
				this.entries.push({
					ts,
					cat: "agent",
					name: "agent_spawned",
					ph: "I",
					scope,
					data: { role: event.role, sessionId: event.sessionId },
				});
				break;
			}

			case "agent_completed": {
				const scope = this.sessionScopeMap.get(event.sessionId);
				this.entries.push({
					ts,
					cat: "agent",
					name: "agent_completed",
					ph: "I",
					scope,
					data: { role: event.role, sessionId: event.sessionId },
				});
				break;
			}

			case "error":
				this.entries.push({
					ts,
					cat: "error",
					name: "error",
					ph: "I",
					data: { message: event.message, stage: event.stage?.name },
				});
				break;

			case "agent_tool_use": {
				const inner = event.event;
				const scope = this.sessionScopeMap.get(event.sessionId);

				if (inner.type === "tool_execution_start") {
					this.pendingTools.set(inner.toolCallId, {
						startTs: ts,
						toolName: inner.toolName,
						role: event.role,
						sessionId: event.sessionId,
					});
					this.entries.push({
						ts,
						cat: "tool",
						name: inner.toolName,
						ph: "B",
						scope,
						data: {
							toolCallId: inner.toolCallId,
							role: event.role,
							sessionId: event.sessionId,
						},
					});
				} else if (inner.type === "tool_execution_end") {
					const pending = this.pendingTools.get(inner.toolCallId);
					if (pending) {
						const endTs = ts;
						const span: ToolSpan = {
							toolName: inner.toolName,
							toolCallId: inner.toolCallId,
							role: pending.role,
							sessionId: pending.sessionId,
							startTs: pending.startTs,
							endTs,
							durationMs: endTs - pending.startTs,
							isError: inner.isError,
						};
						this.spans.push(span);
						this.pendingTools.delete(inner.toolCallId);
					}
					this.entries.push({
						ts,
						cat: "tool",
						name: inner.toolName,
						ph: "E",
						scope,
						data: {
							toolCallId: inner.toolCallId,
							role: event.role,
							sessionId: event.sessionId,
							isError: inner.isError,
						},
					});
				}
				break;
			}

			// Intentionally ignored events (stage_stats, stage_iteration, agent_turn, spawn_completion)
			default:
				break;
		}
	}

	// --------------------------------------------------------------------------
	// Output Writing
	// --------------------------------------------------------------------------

	async writeOutput(): Promise<{ tracePath: string; summaryPath: string }> {
		await mkdir(this.outputDir, { recursive: true });

		const timestamp = formatTimestamp(new Date());
		const base = `profile-${timestamp}`;
		const tracePath = join(this.outputDir, `${base}.trace.jsonl`);
		const summaryPath = join(this.outputDir, `${base}.summary.txt`);

		const traceContent = `${this.entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
		const summaryContent = buildSummary(
			this.entries,
			this.spans,
			this.pendingTools,
		);

		await Promise.all([
			writeFile(tracePath, traceContent, "utf8"),
			writeFile(summaryPath, summaryContent, "utf8"),
		]);

		return { tracePath, summaryPath };
	}

	// --------------------------------------------------------------------------
	// Internal Helpers
	// --------------------------------------------------------------------------

	private assignScope(role: string, sessionId: string): string | undefined {
		if (!this.activeParallelGroup) return undefined;

		const group = this.activeParallelGroup;
		const existing = group.sessionScopes.get(sessionId);
		if (existing) return existing;

		const index = group.roleCount.get(role) ?? 0;
		group.roleCount.set(role, index + 1);

		const scope = `${role}.${index}`;
		group.sessionScopes.set(sessionId, scope);
		this.sessionScopeMap.set(sessionId, scope);

		return scope;
	}
}

// ============================================================================
// Summary Builder (pure function)
// ============================================================================

export function buildSummary(
	entries: ProfileTraceEntry[],
	spans: ToolSpan[],
	pendingTools: Map<string, PendingTool>,
): string {
	const lines: string[] = [];

	// ---- Chain Overview ----
	const chainStart = entries.find((e) => e.cat === "chain" && e.ph === "B");
	const chainEnd = entries.find((e) => e.cat === "chain" && e.ph === "E");
	const totalMs =
		chainStart !== undefined && chainEnd !== undefined
			? chainEnd.ts - chainStart.ts
			: undefined;

	lines.push("=== Chain Overview ===");
	if (totalMs !== undefined) {
		lines.push(`Total wall-clock: ${formatDuration(totalMs)}`);
	} else {
		lines.push("Total wall-clock: (chain did not complete)");
	}
	lines.push("");

	// ---- Stage Breakdown ----
	lines.push("=== Stage Breakdown ===");
	const stageBegins = entries.filter((e) => e.cat === "stage" && e.ph === "B");
	const stageEnds = entries.filter((e) => e.cat === "stage" && e.ph === "E");

	if (stageBegins.length === 0) {
		lines.push("  (no stages recorded)");
	} else {
		for (const begin of stageBegins) {
			const end = stageEnds.find(
				(e) => e.name === begin.name && e.ts >= begin.ts,
			);
			const dur = end !== undefined ? end.ts - begin.ts : undefined;
			const durStr = dur !== undefined ? formatDuration(dur) : "(incomplete)";
			lines.push(`  ${begin.name}: ${durStr}`);
		}
	}
	lines.push("");

	// ---- Parallel Group Breakdown ----
	const parallelBegins = entries.filter(
		(e) => e.cat === "parallel" && e.ph === "B",
	);
	const parallelEnds = entries.filter(
		(e) => e.cat === "parallel" && e.ph === "E",
	);

	if (parallelBegins.length > 0) {
		lines.push("=== Parallel Group Breakdown ===");
		for (const pgBegin of parallelBegins) {
			const pgEnd = parallelEnds.find(
				(e) =>
					e.data?.stepIndex === pgBegin.data?.stepIndex && e.ts >= pgBegin.ts,
			);
			const groupDur = pgEnd !== undefined ? pgEnd.ts - pgBegin.ts : undefined;
			const groupDurStr =
				groupDur !== undefined ? formatDuration(groupDur) : "(incomplete)";
			lines.push(
				`  Group [stepIndex=${pgBegin.data?.stepIndex}]: ${groupDurStr}`,
			);

			// Find agent_spawned events between begin and end of this group
			const groupEndTs = pgEnd?.ts ?? Number.MAX_SAFE_INTEGER;
			const members = entries.filter(
				(e) =>
					e.cat === "agent" &&
					e.name === "agent_spawned" &&
					e.ts >= pgBegin.ts &&
					e.ts <= groupEndTs &&
					e.scope !== undefined,
			);

			let sumOfMembers = 0;
			for (const member of members) {
				const sessionId = member.data?.sessionId as string | undefined;
				const scope = member.scope ?? "unknown";
				// Find agent_completed for this session
				const completed = entries.find(
					(e) =>
						e.cat === "agent" &&
						e.name === "agent_completed" &&
						e.data?.sessionId === sessionId,
				);
				const memberDur =
					completed !== undefined ? completed.ts - member.ts : undefined;
				const memberDurStr =
					memberDur !== undefined ? formatDuration(memberDur) : "(incomplete)";
				if (memberDur !== undefined) sumOfMembers += memberDur;
				lines.push(`    ${scope}: ${memberDurStr}`);
			}

			if (groupDur !== undefined && sumOfMembers > 0) {
				const overlapRatio = sumOfMembers / groupDur;
				lines.push(
					`    Overlap ratio (sum-of-members / group wall-clock): ${overlapRatio.toFixed(2)}x`,
				);
			}
		}
		lines.push("");
	}

	// ---- Slowest Tools (top 20) ----
	lines.push("=== Slowest Tools (top 20) ===");
	if (spans.length === 0) {
		lines.push("  (no tool calls recorded)");
	} else {
		const sorted = [...spans]
			.sort((a, b) => b.durationMs - a.durationMs)
			.slice(0, 20);
		for (const span of sorted) {
			const errorTag = span.isError ? " [error]" : "";
			lines.push(
				`  ${span.toolName}${errorTag}  ${formatDuration(span.durationMs)}  (${span.role}, ${span.sessionId})`,
			);
		}
	}
	lines.push("");

	// ---- Per-Agent Tool Breakdown ----
	lines.push("=== Per-Agent Tool Breakdown ===");
	if (spans.length === 0) {
		lines.push("  (no tool calls recorded)");
	} else {
		const byRole = new Map<string, { count: number; totalMs: number }>();
		for (const span of spans) {
			const existing = byRole.get(span.role) ?? { count: 0, totalMs: 0 };
			byRole.set(span.role, {
				count: existing.count + 1,
				totalMs: existing.totalMs + span.durationMs,
			});
		}
		for (const [role, stats] of [...byRole].sort(
			(a, b) => b[1].totalMs - a[1].totalMs,
		)) {
			lines.push(
				`  ${role}: ${stats.count} calls, ${formatDuration(stats.totalMs)} total`,
			);
		}
	}
	lines.push("");

	// ---- Orphaned / Incomplete Tool Calls ----
	lines.push("=== Orphaned / Incomplete Tool Calls ===");
	if (pendingTools.size === 0) {
		lines.push("  (none)");
	} else {
		for (const [toolCallId, pending] of pendingTools) {
			lines.push(
				`  ${pending.toolName}  callId=${toolCallId}  role=${pending.role}  sessionId=${pending.sessionId}  startTs=${pending.startTs}ms`,
			);
		}
	}
	lines.push("");

	return lines.join("\n");
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = ((ms % 60_000) / 1000).toFixed(1);
	return `${minutes}m${seconds}s`;
}

function formatTimestamp(date: Date): string {
	const pad = (n: number, len = 2) => String(n).padStart(len, "0");
	const y = date.getFullYear();
	const mo = pad(date.getMonth() + 1);
	const d = pad(date.getDate());
	const h = pad(date.getHours());
	const mi = pad(date.getMinutes());
	const s = pad(date.getSeconds());
	return `${y}${mo}${d}-${h}${mi}${s}`;
}
