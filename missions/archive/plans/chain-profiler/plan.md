---
title: 'Chain Profiler: Post-Run Execution Analysis'
status: active
createdAt: '2026-04-10T19:57:27.866Z'
updatedAt: '2026-04-10T20:12:19.371Z'
---

## Overview

Add a chain profiler that collects timestamped events during a chain run, pairs tool start/end events to compute per-tool durations, and writes structured output (JSONL trace + human-readable summary) to a file for post-run performance analysis. Activated via a `--profile` CLI flag on `--workflow` runs.

## Current State

The event system is already rich. `ChainEvent` (in `lib/orchestration/types.ts:258`) covers chain/stage/agent/tool lifecycle. Tool events carry `toolCallId` fields that uniquely identify a tool invocation across `tool_execution_start` and `tool_execution_end` events. The chain runner (`lib/orchestration/chain-runner.ts`) emits all these events through `config.onEvent`. The CLI (`cli/main.ts:406`) wires a single `createChainEventLogger()` callback that formats events for stderr.

**Gap**: Nobody pairs tool start/end events to compute durations. There is no structured file output for post-run analysis. The existing logger is terminal-only and ephemeral.

## Design

### Module structure

**`lib/orchestration/chain-profiler.ts`** — Pure event collector + trace writer. Single responsibility: accumulate `ChainEvent`s, pair tool start/end to compute durations, and serialize to structured output formats (JSONL trace, summary report). No terminal output, no CLI concerns, no path resolution. Receives an output directory as a constructor parameter. Depends only on `lib/orchestration/types.ts` and `node:fs/promises`.

**`cli/main.ts`** — Wiring and path resolution only. When `--profile` is set, resolves the output directory using existing helpers (`derivePlanSlug` from `chain-runner.ts`, `sessionsDirForPlan` from `lib/sessions/session-store.ts`), instantiates the profiler, composes its `onEvent` with the existing `createChainEventLogger()`, and calls `writeOutput()` after `runChain` returns.

### Dependency graph

```
cli/main.ts → lib/orchestration/chain-profiler.ts → lib/orchestration/types.ts
            → lib/orchestration/chain-runner.ts (derivePlanSlug — already imported)
            → lib/sessions/session-store.ts (sessionsDirForPlan)
                                                   → node:fs/promises
```

Domain logic (`chain-profiler.ts`) depends only on types and `node:fs`. Path resolution lives in the CLI layer, reusing existing helpers. No reverse dependencies. No new path-derivation logic.

### Key contracts

#### ProfileTraceEntry (JSONL trace line)

Each line in the JSONL trace file is one of these:

```typescript
/** A single profiler trace entry, written as one JSONL line. */
interface ProfileTraceEntry {
  /** Monotonic timestamp relative to chain start (ms) */
  ts: number;
  /** Event category */
  cat: "chain" | "stage" | "parallel" | "agent" | "tool" | "error";
  /** Event name — maps from ChainEvent.type */
  name: string;
  /** Phase: B=begin, E=end, I=instant */
  ph: "B" | "E" | "I";
  /** Disambiguator for parallel members sharing the same role name (e.g. "reviewer.0", "reviewer.1") */
  scope?: string;
  /** Payload — event-specific data */
  data?: Record<string, unknown>;
}
```

This format is intentionally close to Chrome Trace Event format for potential future visualization, but simpler — no process/thread IDs.

#### ToolSpan (computed duration)

```typescript
interface ToolSpan {
  toolName: string;
  toolCallId: string;
  role: string;
  sessionId: string;
  startTs: number;
  endTs: number;
  durationMs: number;
  isError: boolean;
}
```

#### ChainProfiler class (public API)

```typescript
interface ChainProfilerOptions {
  /** Absolute path to the directory where output files are written. */
  outputDir: string;
}

class ChainProfiler {
  constructor(options: ChainProfilerOptions);
  
  /** The onEvent callback to wire into ChainConfig.onEvent */
  handleEvent(event: ChainEvent): void;
  
  /** Write trace (JSONL) and summary (text) files. Safe to call even if chain was aborted — flushes whatever was collected. */
  async writeOutput(): Promise<{ tracePath: string; summaryPath: string }>;
}
```

#### Output file location

The profiler receives `outputDir` — it does not resolve paths itself. The CLI layer resolves this:

1. **When `completionLabel` yields a plan slug** (via `derivePlanSlug()` already in `chain-runner.ts`): use `sessionsDirForPlan(projectRoot, planSlug)` → `missions/sessions/<planSlug>/`
2. **Otherwise**: use `join(projectRoot, "missions", "sessions", "_profiles")` — a well-known fallback that stays within the `missions/sessions/` subtree, making it discoverable alongside other session artifacts and compatible with future archive tooling.

Filenames include an ISO timestamp: `profile-<YYYYMMDD-HHmmss>.trace.jsonl` and `profile-<YYYYMMDD-HHmmss>.summary.txt`.

#### Parallel stage disambiguation

Fan-out (`reviewer[3]`) produces multiple `ChainStage` objects with the same `name`. The profiler distinguishes them by tracking `sessionId` from `agent_spawned` events within a `parallel_start`/`parallel_end` block. Each member gets a `scope` tag in trace entries: `"reviewer.0"`, `"reviewer.1"`, etc., based on spawn order within the group.

The summary's parallel section reports:
- Each member's wall-clock duration and role+scope
- Group wall-clock (start to last end) vs sum-of-members (concurrent overlap ratio)

### Integration seams

**`ChainConfig.onEvent`** (`lib/orchestration/types.ts:120`): Currently accepts a single `(event: ChainEvent) => void`. The profiler's `handleEvent` has the same signature. In `cli/main.ts`, we compose both callbacks into one that calls both:

```typescript
// In cli/main.ts, when --profile is set:
const logger = createChainEventLogger();
const profiler = new ChainProfiler({ outputDir });
const onEvent = (event: ChainEvent) => {
  logger(event);
  profiler.handleEvent(event);
};
```

No changes to `ChainConfig` or `chain-runner.ts` needed.

**Tool event pairing**: `tool_execution_start` and `tool_execution_end` share the same `toolCallId` (`lib/orchestration/types.ts:243,249`). The profiler maintains a `Map<string, { startTs, toolName, role, sessionId }>` keyed by `toolCallId`. On `tool_execution_end`, it looks up the start entry, computes duration, and records a `ToolSpan`. Orphaned starts (no matching end) are reported in the summary as incomplete.

**`agent_tool_use` event** (`lib/orchestration/types.ts:276`): This is the `ChainEvent` wrapper that carries the underlying `SpawnEvent` with `tool_execution_start`/`tool_execution_end`. The profiler extracts `event.event` to access `toolCallId`, `toolName`, etc.

**Cancellation/abort**: `writeOutput()` is safe to call at any point — it flushes whatever trace entries have been collected so far. The CLI calls it in a `finally` block after `runChain` returns, so partial profiles are always written even if the chain was aborted or failed.

### Seams for change

The `ProfileTraceEntry` format is designed for extensibility — the `data` field is `Record<string, unknown>`, so new event types can be added without breaking the schema. The summary report is a plain function that takes the collected data and returns a string, making it easy to swap or extend the formatting.

## Approach

1. **Event collection**: `ChainProfiler.handleEvent` records a monotonic timestamp (relative to `chain_start`) and converts each `ChainEvent` into one or more `ProfileTraceEntry` objects stored in an array. Begin/End events (stage_start/stage_end, tool_execution_start/tool_execution_end) use `ph: "B"/"E"`. Instant events (error, agent_spawned) use `ph: "I"`. Parallel groups are tracked: `parallel_start` opens a group context, `agent_spawned` within that context assigns scope indices, `parallel_end` closes it.

2. **Tool duration pairing**: A `Map<string, PendingTool>` keyed by `toolCallId`. On `tool_execution_start`, store `{ startTs, toolName, role, sessionId }`. On `tool_execution_end`, look up the pending entry, compute `durationMs = endTs - startTs`, create a `ToolSpan`, and delete the pending entry. This is O(1) per event.

3. **Output writing**: `writeOutput()` writes two files:
   - `.trace.jsonl`: One `ProfileTraceEntry` per line, `JSON.stringify` + newline.
   - `.summary.txt`: Generated by a pure `buildSummary()` function from the collected trace entries and tool spans. Sections: chain overview, stage breakdown, parallel group breakdown (per-member durations, overlap ratio), slowest tools (top 20), per-agent tool breakdown.

4. **CLI wiring**: `--profile` flag added to Commander in `cli/main.ts`. When set, resolve output directory using `derivePlanSlug()` + `sessionsDirForPlan()` or the `_profiles` fallback, instantiate `ChainProfiler`, compose `onEvent`, call `writeOutput()` in a finally block after `runChain` returns. Print the output file paths to stderr. All profiling code paths are gated behind the `--profile` check — zero overhead when not profiling.

## Files to Change

- `lib/orchestration/chain-profiler.ts` — **new file**. `ChainProfiler` class, `ProfileTraceEntry` and `ToolSpan` types, `buildSummary()` function, JSONL writer. Receives `outputDir` — no path resolution logic.
- `cli/main.ts` — Add `--profile` flag to Commander options. Resolve output directory using existing `derivePlanSlug()` and `sessionsDirForPlan()`. Compose profiler with existing logger when flag is set. Call `writeOutput()` in a `finally` block after `runChain`. Wire into the `--workflow` path (line ~402) — this is the only CLI entry point for chain execution.
- `cli/types.ts` — Add `profile?: boolean` to `CliOptions`.
- `tests/orchestration/chain-profiler.test.ts` — **new file**. Tests for event collection, tool pairing, orphan handling, summary generation, JSONL output format, and parallel group disambiguation.

## Risks

- **Orphaned tool events**: If an agent crashes mid-tool-call, `tool_execution_end` never fires. The profiler tracks pending tools and reports them as incomplete in the summary rather than silently dropping them. Blast radius: summary accuracy only — no functional impact.
  Classification: **Mitigated** — orphans are explicitly reported.

- **Memory for long-running chains**: The profiler holds all trace entries in memory. For a 30-minute chain with ~1000 tool calls, this is negligible (~100KB). For pathological cases (thousands of rapid tool calls), the in-memory array could grow. Blast radius: profiler process memory only — chain execution is unaffected since the profiler is a passive listener.
  Classification: **Accepted** — the safety caps (50 iterations, 30 min timeout) bound this in practice.

- **File write failure**: The output directory might not exist (e.g., `missions/sessions/` not scaffolded). The profiler creates directories with `mkdir({ recursive: true })` before writing. If that still fails, the error is caught in the CLI layer and reported to stderr without affecting the chain result.
  Classification: **Mitigated** — `mkdir` recursive + try/catch in CLI.

- **Fan-out scope disambiguation**: Multiple parallel stages with the same role name could produce confusing output. Mitigated by scope tagging (`reviewer.0`, `reviewer.1`) derived from spawn order within a `parallel_start`/`parallel_end` block.
  Classification: **Mitigated** — scope tags in trace entries and summary.

## Quality Contract

- id: QC-001
  category: correctness
  criterion: "Tool start/end events with matching toolCallId are paired correctly — the computed durationMs equals endTs minus startTs for every ToolSpan"
  verification: verifier
  command: "bun run test -- --grep 'chain-profiler'"

- id: QC-002
  category: correctness
  criterion: "Orphaned tool_execution_start events (no matching end) appear in the summary report as incomplete tool calls, not silently dropped"
  verification: verifier
  command: "bun run test -- --grep 'orphan'"

- id: QC-003
  category: architecture
  criterion: "chain-profiler.ts imports only from lib/orchestration/types.ts and node:* modules — no imports from chain-runner, agent-spawner, session-store, CLI, or other infrastructure"
  verification: reviewer

- id: QC-004
  category: integration
  criterion: "The --profile flag produces both a .trace.jsonl file and a .summary.txt file in the expected output directory after a chain run"
  verification: verifier
  command: "bun run test -- --grep 'profile.*output'"

- id: QC-005
  category: behavior
  criterion: "When --profile is not set, no profiler is instantiated and no output files are written — zero overhead on non-profiled runs"
  verification: reviewer

- id: QC-006
  category: correctness
  criterion: "Each JSONL trace line is valid JSON and conforms to the ProfileTraceEntry schema (ts, cat, name, ph fields present)"
  verification: verifier
  command: "bun run test -- --grep 'JSONL'"

- id: QC-007
  category: correctness
  criterion: "Parallel group members with the same role name (fan-out) are disambiguated in both trace entries and summary output with scope tags"
  verification: verifier
  command: "bun run test -- --grep 'parallel.*fan-out|fan-out.*parallel'"

- id: QC-008
  category: behavior
  criterion: "writeOutput() flushes partial profile data when chain is aborted — calling it after an interrupted run produces valid output files with the events collected up to that point"
  verification: verifier
  command: "bun run test -- --grep 'abort|partial'"

- id: QC-009
  category: architecture
  criterion: "Output directory resolution in cli/main.ts reuses derivePlanSlug() and sessionsDirForPlan() — no new path derivation logic in the profiler module"
  verification: reviewer

## Implementation Order

1. **Core profiler module** (`lib/orchestration/chain-profiler.ts`) — Types (`ProfileTraceEntry`, `ToolSpan`), `ChainProfiler` class with `handleEvent` and `writeOutput`, `buildSummary` function. Receives `outputDir` as constructor param. Self-contained and testable in isolation.
2. **Tests** (`tests/orchestration/chain-profiler.test.ts`) — Feed synthetic `ChainEvent` sequences into the profiler, verify trace entries, tool pairing, orphan handling, parallel group disambiguation, abort/partial flush, summary output, and JSONL format.
3. **CLI integration** (`cli/main.ts`, `cli/types.ts`) — Add `--profile` flag, resolve output directory using existing helpers, compose `onEvent`, call `writeOutput` in finally block, print output paths to stderr.
