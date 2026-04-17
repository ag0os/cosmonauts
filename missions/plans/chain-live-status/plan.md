---
title: Live in-place chain output rendering
status: active
createdAt: '2026-04-16T15:26:54.143Z'
updatedAt: '2026-04-16T21:57:17.205Z'
---

## Summary

Replace noisy per-event sub-agent scrollback with two grounded live surfaces that match the current code: a session-scoped live spawn widget for `spawn_agent`, and an in-place `chain_run` tool row driven by `runChain(... onEvent)`. Preserve debuggability by persisting per-spawn history in the parent session and exposing an on-demand transcript view for interactive sessions that do not have plan-backed session files.

## Scope

**Included**
- Interactive live status for child spawns started via `spawn_agent`
- Interactive live status for `chain_run` without appending a growing progress log during execution
- Retrieval of child transcripts/results in ordinary interactive sessions where child sessions are in-memory
- Test updates for event translation, cleanup, and fallback behavior

**Excluded**
- Changing the chain runner event model or coordinator logic
- Wiring Cosmonauts CLI support for Pi `--mode json` (Cosmonauts currently disables `--mode` passthrough)
- Persisting full child JSONL session files for non-plan interactive spawns

**Assumptions**
- Interactive/RPC UI code is gated with `ctx.hasUI`; print/non-UI modes keep the current text-only behavior.
- Child-result follow-up messages (`[spawn_completion] ...`) remain the mechanism agents use for orchestration logic; the live UI is visual only.

## Design

### Module structure

**Existing modules to modify**
- `domains/shared/extensions/orchestration/index.ts` — session-scoped UI wiring for orchestration. It will stop injecting one message per child tool-start event and instead own the live widget, transcript-view command, history restore, and context filtering for view-only transcript messages.
- `domains/shared/extensions/orchestration/spawn-tool.ts` — child session launcher. It will keep the current accepted/follow-up lifecycle, but publish tracker lifecycle events on the shared orchestration bus and append parent-session spawn history on completion/failure.
- `domains/shared/extensions/orchestration/chain-tool.ts` — chain execution UI. It will replace the partial growing log with a live snapshot model during execution while preserving the final expanded log and cost table.
- `domains/shared/extensions/orchestration/rendering.ts` — pure rendering helpers. It will remain the home for tool summarization and gain pure translators/reducers for live spawn status and chain live snapshots.

**New modules**
- `domains/shared/extensions/orchestration/live-status.ts` — pure state reducer for interactive spawn status lines and chain snapshot formatting. Single responsibility: map verified event contracts into compact UI state.
- `domains/shared/extensions/orchestration/spawn-history.ts` — persistence helpers for parent-session child history. Single responsibility: define the stored record shape, append/restore helpers, and transcript lookup rules.

**Test modules**
- `tests/extensions/orchestration-activity.test.ts` — update from per-message forwarding assertions to widget/subscription cleanup assertions.
- `tests/extensions/orchestration-rendering.test.ts` — extend with tests for spawn activity translation and chain live snapshot reduction while keeping the existing expanded-log helpers covered.
- `tests/extensions/orchestration.test.ts` — cover the spawn tool’s shared-bus/history behavior and chain tool’s final rendering contract.
- `tests/extensions/orchestration-live-status.test.ts` — new pure reducer tests for live spawn/chain state.
- `tests/extensions/orchestration-history.test.ts` — new tests for append/restore/show behavior in plan-backed and non-plan sessions.

### Dependency graph

- `spawn-tool.ts` → `live-status.ts` / `spawn-history.ts` / `rendering.ts`
- `chain-tool.ts` → `live-status.ts` / `rendering.ts`
- `index.ts` → `live-status.ts` / `spawn-history.ts`
- `live-status.ts` → `rendering.ts` only
- `spawn-history.ts` → no orchestration UI modules; it owns only persistence data shaping

Dependency rule: the pure helper modules (`live-status.ts`, `spawn-history.ts`, `rendering.ts`) must not import Pi session/runtime wiring from `index.ts`, `spawn-tool.ts`, or `chain-tool.ts`. The tool/extension entry points depend on the pure helpers, never the reverse.

### Key contracts

**1. Live spawn widget contract**

The spawn widget consumes the actual orchestration bus events, not invented tool-call payloads:

```ts
interface LiveSpawnEntry {
  spawnId: string;
  role: string;
  taskId?: string;
  statusText: string;
}

type LiveSpawnEvent =
  | SpawnRegisteredEvent
  | SpawnActivityEvent
  | SpawnCompletedEvent
  | SpawnFailedEvent;
```

Rules:
- `SpawnRegisteredEvent` creates an active entry with `statusText = "Starting…"`.
- `SpawnActivityEvent.activity.kind === "tool_start"` updates `statusText` using the event’s existing `summary` string.
- `turn_start`, `turn_end`, and `compaction` map to friendly fallbacks such as `Thinking…` / `Compacting context…`.
- `SpawnCompletedEvent` / `SpawnFailedEvent` remove the active row for that `spawnId`; completion remains visible through the existing `[spawn_completion]` follow-up user message.

**2. Parent-session spawn history contract**

Every child completion/failure appends one parent-session entry so non-plan interactive sessions do not rely on filesystem transcripts:

```ts
interface SpawnHistoryRecord {
  spawnId: string;
  role: string;
  taskId?: string;
  outcome: "success" | "failed";
  summary: string;
  completedAt: string;
  transcript?: string;
  transcriptFile?: string;
}
```

Storage rules:
- Persist with `pi.appendEntry("spawn-history", record)`.
- For plan-backed child sessions, store `transcriptFile` (the generated transcript already written to disk).
- For non-plan child sessions, store `transcript` generated from `generateTranscript(finalMessages, role)` so `/show-spawn <spawnId>` works even when the child used `SessionManager.inMemory()`.

**3. Chain live snapshot contract**

`chain_run` live rendering is driven only by `ChainEvent` from `runChain(... onEvent)`:

```ts
interface ChainLiveSnapshot {
  active: Array<{
    key: string;
    role: string;
    statusText: string;
  }>;
  completedStages: number;
  totalStages: number;
  log: string[];
  result?: ChainResult;
}
```

Rules:
- `log` keeps the existing expanded progress/history output built from `chainEventToProgressLine()`.
- `active` is keyed by `sessionId` when available; fall back to a role-scoped pending key until `agent_spawned` arrives.
- Parallel/fan-out execution renders one live line per active entry (with overflow collapse if needed), not a single lossy line for the whole group.
- Final collapsed render shows a compact completion/failure summary; expanded render shows `log` plus the existing cost table.

### Integration seams

- `spawn-tool.ts:350-383` currently publishes only `SpawnActivityEvent.activity.kind` plus `toolName` and preformatted `summary`; there are no raw tool args on this path. The new spawn translator must consume that exact contract.
- `index.ts:105-126` currently subscribes to `activityBus` and injects one `spawn-activity` custom message per forwarded tool-start event via `pi.sendMessage(...)`. This is the actual scrollback source and must be removed/replaced, not layered over.
- `spawn-tool.ts:426-443` and `spawn-tool.ts:510-512` deliver child completion/failure later through `pi.sendUserMessage(..., { deliverAs: "followUp" })`. Because the original `spawn_agent` tool call already returned `accepted`, the design must not rely on that tool row receiving a final `renderResult` update.
- `spawn-tool.ts:459` and `index.ts:103-105` already coordinate session-scoped teardown through `registerSessionCleanup(...)` / `runSessionCleanup(...)`. The live widget subscription must reuse this existing cleanup seam so disposed child sessions do not leak listeners.
- `chain-tool.ts:92-118` already has the correct live integration boundary: `runChain({ onEvent })` feeds partial `onUpdate(...)` updates. The chain design must stay on this path instead of introducing a second activity-bus source.
- `rendering.ts:76-101` already turns `ChainEvent` into textual log lines via `chainEventToProgressLine()` and `summarizeToolCall()`. The revised design keeps this as the expanded-history path and layers the compact live snapshot on top.
- `session-factory.ts:97` confirms non-plan child sessions use `SessionManager.inMemory()`. The history/view path therefore must not assume a transcript file exists.
- `todo/index.ts:14` and `todo/index.ts:104` establish the existing Pi pattern for extension-local persistence with `pi.appendEntry(...)` plus restore via `ctx.sessionManager.getEntries()`.
- `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md:1768-1790` confirms the available tool rendering API is `renderCall` / `renderResult` with `renderShell: "self"`, not a separate tool-level `render` hook.
- `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md:746-748` and `:2203` confirm UI behavior must be gated with `ctx.hasUI` instead of stdout/CLI heuristics.

### Seams for change

- The live-status translation is isolated in `live-status.ts`, so adding new tool names or alternate wording only changes one reducer/formatter.
- Spawn-history storage separates inline transcripts from file-backed transcripts. If Cosmonauts later adds persistent non-plan child sessions, only `spawn-history.ts` needs to change.
- `chain-tool.ts` keeps the live snapshot separate from the expanded textual log, so future richer chain UIs can replace the compact renderer without losing the debug/audit trail.

## Approach

Use pure reducers plus session-scoped UI wiring instead of trying to stretch one tool row across two different lifecycles.

Key decisions:
- **`spawn_agent` uses a widget, not the tool row, for live progress.** The tool returns immediately with `accepted`, so its row cannot truthfully become `done` later. The widget shows only active spawns; the existing follow-up user messages remain the durable completion signal.
- **`chain_run` stays on its existing `onEvent` path.** It already has richer data than `spawn_activity`, including raw tool args and explicit stage events, so no duplication through the activity bus is introduced.
- **Inspectability is preserved through parent-session history.** Hiding per-event scrollback is only acceptable if ordinary interactive sessions can still recover child output without needing plan-backed files.
- **Non-UI fallback is explicit.** When `ctx.hasUI` is false, skip widgets and keep the current textual execution/follow-up behavior.

Composition strategy:
1. Child spawn emits lifecycle/activity on the shared orchestration bus.
2. Session widget reduces those events into active rows and re-renders in place.
3. Spawn completion appends a `spawn-history` entry to the parent session.
4. `/show-spawn <spawnId>` reads restored history and emits a view-only transcript message (filtered from LLM context).
5. `chain_run` separately reduces `ChainEvent` into a compact live snapshot during partial updates and reuses the existing textual log for expanded/final output.

## Files to Change

- `domains/shared/extensions/orchestration/index.ts` — replace per-event `spawn-activity` message injection with a session-scoped live widget, register `/show-spawn`, restore `spawn-history`, and filter transcript-view messages from LLM context
- `domains/shared/extensions/orchestration/spawn-tool.ts` — source the interactive tracker from the shared orchestration bus, append `spawn-history` entries on completion/failure, and keep existing follow-up completion delivery
- `domains/shared/extensions/orchestration/chain-tool.ts` — change partial rendering from an ever-growing line log to a compact live snapshot; preserve final expanded log and cost table
- `domains/shared/extensions/orchestration/rendering.ts` — keep existing summary/log helpers and add pure live-status translation helpers used by spawn and chain UIs
- `domains/shared/extensions/orchestration/live-status.ts` — new pure reducer/formatter for active spawn rows and chain live snapshot state
- `domains/shared/extensions/orchestration/spawn-history.ts` — new persistence/restore helpers for `spawn-history` entries and transcript lookup
- `tests/extensions/orchestration-activity.test.ts` — update assertions to the new widget/subscription behavior and cleanup path
- `tests/extensions/orchestration-rendering.test.ts` — add tests for spawn activity translation and chain live snapshot reduction
- `tests/extensions/orchestration.test.ts` — verify shared-bus wiring, history append behavior, and chain final render/cost-table preservation
- `tests/extensions/orchestration-live-status.test.ts` — new reducer tests for active spawn rows, completion cleanup, and fan-out rendering
- `tests/extensions/orchestration-history.test.ts` — new tests for restoring history entries and showing transcripts in plan-backed vs non-plan sessions

## Risks

- **Must fix — active rows can leak after child completion/failure if lifecycle events are not sourced from the same bus as activity.** Blast radius: every interactive session using `spawn_agent`; stale rows would make the live widget incorrect and confusing until session restart. Countermeasure: `spawn-tool.ts` must use the shared orchestration bus for tracker lifecycle events and tests must cover completion, failure, and dispose cleanup.
- **Must fix — non-plan interactive spawns can lose transcript access if history storage assumes filesystem sessions.** Blast radius: ordinary REPL usage outside workflows/plans; users would lose the only recoverable child output after scrollback suppression. Countermeasure: store inline generated transcripts in `spawn-history` when `planSlug`/`transcriptFile` is absent.
- **Mitigated — fan-out/parallel chain stages can collapse distinct active children into one misleading status.** Blast radius: `chain_run` with bracket groups or `reviewer[3]`; users would see incomplete progress and may think work is stuck. Countermeasure: key active chain entries by `sessionId` when available and render a small multi-line block for concurrent work.
- **Mitigated — storing transcript history in parent-session custom entries can grow long interactive sessions.** Blast radius: resume performance and session file size for heavy spawn usage. Countermeasure: store generated transcripts (already stripped of tool-result noise by `generateTranscript`) rather than raw JSONL, and prefer file references when plan-backed transcripts already exist.
- **Accepted — wording drift for new tool names will fall back to generic live text until translators are updated.** Blast radius: only the phrasing of the live widget/row, not orchestration correctness. This is acceptable because the fallback remains truthful (`Working…` / summarized tool name).

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "`domains/shared/extensions/orchestration/index.ts` no longer emits one `pi.sendMessage(... customType: \"spawn-activity\")` row per child tool-start event; interactive spawn progress is rendered from a session widget/state reducer instead."
  verification: reviewer

- id: QC-002
  category: behavior
  criterion: "Disposing or completing a child session removes its live status row and leaves no leaked bus subscription across repeated ephemeral sessions."
  verification: verifier
  command: "bun run test -- tests/extensions/orchestration-activity.test.ts tests/extensions/orchestration-live-status.test.ts"

- id: QC-003
  category: integration
  criterion: "`chain_run` derives live execution state only from `runChain(... onEvent)` and still renders the existing final cost summary when the chain completes."
  verification: reviewer

- id: QC-004
  category: behavior
  criterion: "Interactive spawns without `planSlug` persist retrievable `spawn-history` entries, and `/show-spawn <spawnId>` works without assuming a transcript file on disk."
  verification: verifier
  command: "bun run test -- tests/extensions/orchestration-history.test.ts tests/extensions/orchestration.test.ts"

- id: QC-005
  category: correctness
  criterion: "Pure reducers/translators cover tool-start, thinking/compaction fallbacks, completion cleanup, and parallel/fan-out chain snapshots without relying on renderer internals."
  verification: verifier
  command: "bun run test -- tests/extensions/orchestration-rendering.test.ts tests/extensions/orchestration-live-status.test.ts"

- id: QC-006
  category: correctness
  criterion: "The orchestration extension typechecks after the live-status/history changes."
  verification: verifier
  command: "bun run typecheck"

## Implementation Order

1. **Define the pure contracts first** — add `live-status.ts` and `spawn-history.ts`, plus reducer/persistence tests. This locks the event and storage boundaries before touching UI wiring.
2. **Rework interactive spawn status** — change `spawn-tool.ts` to use the shared orchestration bus and append `spawn-history`; update `index.ts` to install the widget, restore history, and register `/show-spawn` with context filtering.
3. **Rework `chain_run` live rendering** — keep `runChain(... onEvent)` as the sole source, add compact partial snapshot rendering, and preserve the expanded final log/cost table.
4. **Regression and cleanup pass** — update the existing orchestration extension tests, verify non-UI fallback behavior, and run the targeted test/typecheck suite.
