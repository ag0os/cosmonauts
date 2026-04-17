---
id: TASK-177
title: Implement ChainProfiler core module
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-profiler'
dependencies: []
createdAt: '2026-04-13T14:47:39.918Z'
updatedAt: '2026-04-13T14:53:44.167Z'
---

## Description

Create `lib/orchestration/chain-profiler.ts` — the self-contained profiler module with no CLI or path-resolution concerns.

**Types to define:**
- `ProfileTraceEntry` — Chrome-trace-inspired JSONL schema: `{ ts, cat, name, ph, scope?, data? }`
- `ToolSpan` — computed tool duration: `{ toolName, toolCallId, role, sessionId, startTs, endTs, durationMs, isError }`
- `ChainProfilerOptions` — `{ outputDir: string }`

**`ChainProfiler` class:**
- Constructor takes `ChainProfilerOptions`; records `chainStartTs` on first `chain_start` event.
- `handleEvent(event: ChainEvent): void` — accumulates `ProfileTraceEntry` objects; converts stage_start/stage_end → `ph:"B"/"E"`, parallel_start/parallel_end → `ph:"B"/"E"`, agent_spawned/agent_completed/error → `ph:"I"`, agent_tool_use carrying tool_execution_start/end → `ph:"B"/"E"` + tool span pairing.
- Tool pairing: `Map<toolCallId, PendingTool>` — on `tool_execution_start` store `{startTs, toolName, role, sessionId}`, on `tool_execution_end` compute `durationMs`, produce `ToolSpan`, delete pending entry.
- Parallel scope tracking: on `parallel_start` open a group context; each `agent_spawned` within the group gets an index (`reviewer.0`, `reviewer.1`, …) based on spawn order; `parallel_end` closes the group. Scope is attached to trace entries for events within that session.
- `async writeOutput(): Promise<{ tracePath: string; summaryPath: string }>` — creates `outputDir` with `mkdir({ recursive: true })`, generates ISO timestamp filename `profile-<YYYYMMDD-HHmmss>`, writes `.trace.jsonl` (one `JSON.stringify(entry)` per line) and `.summary.txt` (from `buildSummary()`).

**`buildSummary(entries, spans, pendingTools)` pure function:**
Sections: chain overview (total wall-clock), stage breakdown (per-stage duration), parallel group breakdown (per-member wall-clock + overlap ratio vs sum-of-members), slowest tools top-20 (sorted by durationMs), per-agent tool breakdown (tool count + total ms per role), orphaned/incomplete tool calls (pending tools with no matching end).

**Constraints:**
- Imports only from `lib/orchestration/types.ts` and `node:*` modules (no chain-runner, session-store, CLI imports).
- Safe to call `writeOutput()` even if chain was aborted — flushes whatever was collected.

<!-- AC:BEGIN -->
- [ ] #1 ChainProfiler class is exported from lib/orchestration/chain-profiler.ts with handleEvent and writeOutput methods
- [ ] #2 ProfileTraceEntry and ToolSpan types are exported and match the schema in the plan
- [ ] #3 Tool start/end events with matching toolCallId are paired into ToolSpan objects with correct durationMs = endTs - startTs
- [ ] #4 Orphaned tool_execution_start events (no matching end) are tracked and available for summary reporting rather than silently dropped
- [ ] #5 Parallel fan-out members with the same role name are assigned scope tags (e.g. reviewer.0, reviewer.1) based on spawn order within parallel_start/parallel_end blocks
- [ ] #6 writeOutput() creates outputDir with mkdir({ recursive: true }), writes both .trace.jsonl and .summary.txt files, and returns their paths
- [ ] #7 chain-profiler.ts imports only from lib/orchestration/types.ts and node:* — no imports from chain-runner, session-store, agent-spawner, or CLI modules
<!-- AC:END -->

## Implementation Notes

Implemented lib/orchestration/chain-profiler.ts with ChainProfiler class, ProfileTraceEntry/ToolSpan/ChainProfilerOptions types, and buildSummary pure function. 26 tests cover all ACs. Scope tagging persists after parallel_end so tool events from group sessions still inherit scope tags."
