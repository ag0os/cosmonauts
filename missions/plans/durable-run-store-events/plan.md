---
title: 'Durable Runtime Phase 1: Run Store and Normalized Events'
status: active
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-03T21:54:38.252Z'
---

## Overview

Prepare the first shared durable orchestration substrate without changing current Drive behavior. This plan adds generic durable-runtime contracts, a file-backed run store, normalized orchestration events, Drive dual-write compatibility, and read-only normalized run observation helpers.

`missions/plans/durable-run-store-events/spec.md` uses numbered Functional Requirements Seed items rather than explicit acceptance-criterion IDs. For behavior mapping, this plan normalizes those seeds in order:

- `AC-001` - Generic `RunStore` interface for run records, normalized events, step records, status, and recent-run listing.
- `AC-002` - File-backed inspectable storage that preserves Drive-style debuggability.
- `AC-003` - Normalized orchestration event types represent Drive lifecycle, task, backend activity, finalization, and terminal outcomes.
- `AC-004` - Drive writes normalized events alongside existing events without changing current `watch_events`, CLI status/list, or resume behavior.
- `AC-005` - Read-only `run_status` and `run_watch` helpers summarize/page normalized events before any scheduler exists.

Wave-1 scope is intentionally narrow: no scheduler, no backend adapter migration, no durable chain compiler, no Drive CLI/tool behavior change, no SQLite/daemon/remote coordinator, and no mutating controller controls.

## Architecture Context

This plan implements Plan 1 from `missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`: contracts must be generic enough for Drive now and chains/workflows later.
- `D-002 - File-backed first`: the first store is inspectable under `missions/sessions/<scope>/runs/<runId>/`.
- `D-003 - Drive compatibility before chain migration`: Drive remains behavior-owner; normalized runtime data is added around it.
- `D-004 - No default hard timeout for durable runs`: this plan adds no runtime timeout policy; existing Drive per-task timeout behavior stays where it is.
- `D-005 - Normalized events with backend details`: stable top-level orchestration events preserve Drive/backend-specific detail payloads without extending canonical terminal event variants.
- `D-006 - Step results must distinguish unknown from success`: normalized result types include `unknown`; this plan does not harden or reinterpret Drive report parsing.
- `D-007 - First scheduler is local and sequential-first`: no scheduler or parallel mutable execution is introduced.
- `D-008 - Durable chains start narrow`: no chain migration or chain compiler work is introduced.
- `D-009 - Wave-1 controller surface is read-only`: only `run_status`/`run_watch` observation helpers/tools are added; no pause/resume/cancel/intervene controls.
- `D-010 - Scheduler runs in-process for wave 1`: store/controller contracts must not assume an always-live caller or interactive session.

Boundary rules this plan must preserve:

- `lib/durable-runtime/*` must not import from `lib/driver/*`, `cli/*`, `domains/*`, prompt/persona files, or task-management modules. It owns generic types, file storage, and read-only normalized summaries.
- Drive compatibility code may import durable-runtime contracts, but the Drive loop remains in `lib/driver/*` and current Drive status/resume/finalization logic remains compatibility-owned.
- Existing `watch_events` continues to read the legacy Drive `events.jsonl`; new `run_watch` reads normalized orchestration events through `RunRecord.eventsPath`.
- Existing `cosmonauts drive status`, `drive list`, and `drive run --resume` continue to classify from `run.completion.json`, `run.pid`, `run.inline.json`, and legacy Drive `events.jsonl` exactly as they do today.
- The generic store interface must not bake in a backend, scheduler, CLI renderer, or current Drive task model.

Storage compatibility note:

- The architecture target layout uses `events.jsonl` for normalized orchestration events in generic runtime storage. Current Drive already uses root `events.jsonl` as the legacy `DriverEvent` stream consumed by `watch_events` and resume/status compatibility. The `## Storage Layout` section of `missions/architecture/durable-orchestration-runtime.md` now explicitly authorizes the Plan-1 Drive exception: Drive dual-write records normalized events at `orchestration-events.jsonl` in the same run directory and sets `RunRecord.eventsPath` to that file. This is a wave-1 compatibility exception, not a target-architecture change; later frontend migration can make legacy `watch_events` a compatibility view over normalized events.

## Behaviors

### B-001 - Run store creates and loads inspectable run records

- Source: AC-001, AC-002
- Context: a caller creates a `drive` `RunRecord` under a plan scope with no scheduler active
- Action: `FileRunStore.createRun` is called, then the run is loaded, listed, and summarized
- Expected: `run.json`, `graph.json`, `scheduler.json`, normalized `events.jsonl` for generic runs, `artifacts/`, and `steps/` are created under `missions/sessions/<scope>/runs/<runId>/`; record paths are resolved inside the run directory; `loadRun` returns the same record paths/status; `listRecentRuns` orders by `updatedAt`; `readStatus` reports the run's persisted status when no terminal normalized event exists
- Seam: `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/file-store.test.ts` > `creates an inspectable run layout and reloads run metadata`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-001`

### B-002 - Normalized event appends use durable sequence cursors

- Source: AC-001, AC-002, AC-005
- Context: a run has a normalized orchestration event stream and the process that wrote earlier events may have restarted
- Action: events are appended, the store instance is recreated, then another event is appended and read with a cursor
- Expected: stored envelopes have monotonic per-run `seq` values, ISO timestamps, and the correct `runId`; reads order by `seq`; the returned cursor is the latest sequence number rather than a JSONL line count
- Seam: `lib/durable-runtime/file-store.ts`, `lib/durable-runtime/types.ts`
- Test: `tests/durable-runtime/file-store.test.ts` > `continues event sequences after reopening the file store`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-002`

### B-003 - Step records persist safely inside the scoped run directory

- Source: AC-001, AC-002
- Context: the store is asked to write a valid step record for a scoped run and then unsafe scope/run/step identifiers containing path traversal
- Action: `writeStepRecord(ref, step)` and `readStepRecord({ ...ref, stepId })` are called for the valid step; unsafe identifiers are attempted
- Expected: the valid record is written to `missions/sessions/<scope>/runs/<runId>/steps/<stepId>/step.json` and read back; unsafe scope, run, or step identifiers are rejected before any file outside `missions/sessions/<scope>/runs/<runId>/` can be created
- Seam: `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/file-store.test.ts` > `persists step records and rejects path traversal identifiers`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-003`

### B-004 - Normalized event mapping preserves canonical terminal shapes

- Source: AC-003
- Context: representative `DriverEvent`s cover run lifecycle, task lifecycle, backend spawn, backend activity, verification, finalization, task terminal, run terminal, and advisory run-level events that have no task/backend context
- Action: the Drive translation seam normalizes each event
- Expected: every emitted `OrchestrationEvent` matches the architecture Core Contracts exactly. `task_started` maps to `step_ready`; `spawn_started` maps to `step_started` with the Drive backend; terminal `step_blocked`, `step_failed`, and `run_failed` events carry only canonical `reason` fields; only `step_completed` and `run_completed` carry `StepResult`/`RunResult`; advisory events with no canonical run-level activity variant, such as `lock_warning` and `plan_completion_candidate`, are marked legacy-only and return no normalized event rather than fabricating a `stepId`, backend, details field, or result.
- Seam: `lib/driver/durable-events.ts`, `lib/durable-runtime/types.ts`
- Test: `tests/driver/durable-events.test.ts` > `maps driver lifecycle events without fabricating backend or step data`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-004`

### B-005 - Backend reports and finalization evidence survive outside terminal variants

- Source: AC-003, AC-004
- Context: Drive emits backend names, parsed reports with files/verification/progress, driver activity, commits, finalization phases, task finalization failures, contradicted-block annotations, and retryability evidence
- Action: those events are normalized and appended to the durable stream
- Expected: rich Drive/backend-specific evidence is preserved in preceding `step_tool_activity` events, `artifact_written` events, `StepResult`/`RunResult` on completed events, or controller diagnostics; `unknown` reports remain `unknown` and are not silently normalized as success; canonical `step_blocked`, `step_failed`, and `run_failed` events contain no Drive-only fields such as progress, contradicted paths, retryable, finalization phase/task/commit, source outcome, or arbitrary `details`
- Seam: `lib/driver/durable-events.ts`, `lib/durable-runtime/types.ts`
- Test: `tests/driver/durable-events.test.ts` > `preserves reports activity commits and finalization details without extending terminal events`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-005`

### B-006 - Drive dual-writes normalized events without changing legacy events

- Source: AC-004
- Context: an inline or detached Drive run emits existing `DriverEvent`s through the current event sink
- Action: the Drive loop uses a dual-write sink that invokes the legacy sink and then appends normalized orchestration events
- Expected: legacy `events.jsonl` lines remain parseable as the same `DriverEvent` shapes and `watch_events` still sees the same cursor/summary behavior; the same run directory also contains `run.json` and `orchestration-events.jsonl` with normalized envelopes whose `RunRecord.eventsPath` points to the normalized sidecar authorized by the architecture record
- Seam: `lib/driver/driver.ts`, `lib/driver/run-step.ts`, `lib/driver/durable-events.ts`, `lib/driver/event-stream.ts`
- Test: `tests/driver/driver-durable-dual-write.test.ts` > `writes normalized events alongside unchanged legacy driver events`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-006`

### B-007 - Normalized append failures do not change Drive outcomes

- Source: AC-004
- Context: the legacy Drive event log is writable, the Drive durable run record has already been created or adopted, but a normalized event append fails
- Action: a Drive event is emitted through the dual-write sink during a run
- Expected: the legacy event is still written and published exactly as before; the Drive task/run result is not blocked or aborted by the normalized append failure; a diagnostic is available for the normalized write failure without converting it into `EventLogWriteError`
- Seam: `lib/driver/durable-events.ts`, `lib/driver/event-stream.ts`, `lib/driver/run-run-loop.ts`
- Test: `tests/driver/driver-durable-dual-write.test.ts` > `continues the drive run when normalized event append fails`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-007`

### B-008 - Drive status remains based on legacy run state files

- Source: AC-004
- Context: a Drive run directory contains both legacy state files and normalized runtime files
- Action: `cosmonauts drive status` classifies the run
- Expected: classification order remains `run.completion.json`, then `run.pid`, then `run.inline.json`; statuses such as `completed`, `blocked`, `aborted`, `finalization_failed`, `running`, `dead`, and `orphaned` are unchanged; normalized runtime files are ignored by the compatibility command
- Seam: `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/status.test.ts` > `ignores normalized runtime files when classifying drive status`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-008`

### B-009 - Drive list ignores normalized-only run directories

- Source: AC-004
- Context: `missions/sessions/<scope>/runs/` contains a legacy Drive run, a run with both legacy and normalized files, and a normalized-only runtime directory with no legacy Drive state files
- Action: `cosmonauts drive list` enumerates runs
- Expected: list output remains based on legacy Drive state files and excludes normalized-only directories that lack `run.completion.json`, `run.pid`, or `run.inline.json`; adding `run.json` or `orchestration-events.jsonl` alone does not make a Drive run listable
- Seam: `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/list.test.ts` > `ignores normalized-only runtime directories when listing drive runs`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-009`

### B-010 - Drive resume remains based on legacy events while dual-writing resume events

- Source: AC-004
- Context: a previous Drive run has legacy `events.jsonl`, `spec.json`, and pending finalization state, plus normalized runtime files from the dual-write path
- Action: `cosmonauts drive run --resume <runId>` retries pending finalization or slices remaining tasks
- Expected: resume still reads legacy Drive events to find completed/blocked task indices and preserves current finalization recovery behavior; any new resume finalization events are also normalized, but missing normalized events never prevent resume
- Seam: `cli/drive/subcommand.ts`, `lib/driver/durable-events.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume uses legacy driver events while dual-writing normalized resume events`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-010`

### B-011 - Existing watch_events remains a legacy Drive event reader

- Source: AC-004
- Context: a run directory has both legacy `events.jsonl` and normalized `orchestration-events.jsonl`
- Action: the existing `watch_events` tool is called with and without a cursor
- Expected: `watch_events` reads only legacy `DriverEvent` lines, returns the same line-count cursor semantics as today, and does not render normalized events in its text or structured `details.events`
- Seam: `domains/shared/extensions/orchestration/watch-events-tool.ts`, `lib/driver/event-stream.ts`
- Test: `tests/extensions/orchestration-watch-events.test.ts` > `reads legacy driver events when normalized events also exist`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-011`

### B-012 - run_watch pages normalized orchestration events by sequence

- Source: AC-005
- Context: normalized events have been appended for a run, a caller has a previous sequence cursor, and the normalized JSONL may contain a malformed line from a partial or manual write
- Action: `runWatch` is called directly with `sinceSeq` and an optional limit
- Expected: only valid events with `seq > sinceSeq` are returned, text summaries are compact, structured details include full normalized envelopes, malformed lines are reported in result diagnostics without being converted into events, and the returned cursor advances to the last returned event when a limit truncates the page; otherwise it is the latest valid sequence number
- Seam: `lib/durable-runtime/controller.ts`, `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/controller.test.ts` > `pages normalized events by sequence cursor and reports malformed lines`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-012`

### B-013 - run_status gives terminal events precedence over stale run records

- Source: AC-005
- Context: `run.json` has a non-terminal or stale status while the normalized stream contains running, completed, blocked, failed, cancelled, stale, or Drive finalization-failed-as-run-failed events
- Action: `runStatus` is called directly
- Expected: the summary is derived from `RunRecord` plus normalized events ordered by `seq`; the latest terminal run event wins over a stale `RunRecord.status`, the summary exposes both status sources when they disagree, and Drive-specific finalization evidence is surfaced only from adjacent `step_tool_activity` events or controller diagnostics, not by adding a generic `finalization_failed` status or extra fields to `run_failed`
- Seam: `lib/durable-runtime/controller.ts`, `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/controller.test.ts` > `derives status from terminal events when run records disagree`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-013`

### B-014 - run_status and run_watch tools are read-only observation controls

- Source: AC-005
- Context: the orchestration extension registers runtime observation tools for a session
- Action: `run_status` and `run_watch` are called through the extension tool interface
- Expected: tool execution delegates to `lib/durable-runtime/controller.ts`, returns the same status/watch details as the direct helpers, does not write files, and does not register mutating `run_pause`, `run_resume`, `run_cancel`, or `run_intervene` controls
- Seam: `domains/shared/extensions/orchestration/run-control-tools.ts`, `domains/shared/extensions/orchestration/index.ts`
- Test: `tests/extensions/orchestration-run-control.test.ts` > `registers only read-only normalized run observation tools`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-014`

### B-015 - Failed preflight emits a terminal step event

- Source: AC-003, AC-004
- Context: Drive emits `task_started` for a task and then a failed `preflight` event, including branch-mismatch and command-failure cases, with no later legacy `task_blocked` event for that task
- Action: the Drive translation seam normalizes the failed `preflight` event and appends the resulting events
- Expected: the failed preflight produces a `step_tool_activity` event containing the Drive preflight status/details followed by a canonical `step_blocked` event carrying only `reason`; the normalized stream has no `step_ready` left without a terminal step event; `preflight` `started`/`passed` events may produce activity detail but must not produce terminal step events
- Seam: `lib/driver/durable-events.ts`
- Test: `tests/driver/durable-events.test.ts` > `maps failed preflight to activity detail followed by canonical step blocked`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-015`

### B-016 - run_status and run_watch read a Drive-produced normalized sidecar

- Source: AC-004, AC-005
- Context: an actual Drive run is executed through the Drive loop with a fake backend and the Plan-1 dual-write adapter enabled
- Action: after the run reaches a terminal outcome, the test loads the produced `run.json`, follows `RunRecord.eventsPath`, and calls `runStatus` and `runWatch` against that run directory
- Expected: `RunRecord.eventsPath` points at `orchestration-events.jsonl`; `runWatch` pages the normalized envelopes produced by the Drive adapter using sequence cursors; `runStatus` reports the correct terminal state from those normalized events; legacy `events.jsonl` remains a legacy `DriverEvent` stream
- Seam: `lib/driver/driver.ts`, `lib/driver/durable-events.ts`, `lib/durable-runtime/file-store.ts`, `lib/durable-runtime/controller.ts`
- Test: `tests/driver/driver-durable-dual-write.test.ts` > `reports normalized status and events from a drive-produced run record events path`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-016`

### B-017 - Drive run-record setup is lazy and failure-isolated

- Source: AC-004
- Context: the durable store cannot create or adopt the normalized `RunRecord` before the first Drive event, while the legacy Drive event sink is writable
- Action: an inline Drive run emits its first event through the dual-write sink
- Expected: durable run-record setup is attempted only inside the durable sink after the legacy sink has accepted the event; setup failure is reported as a diagnostic and disables/skips the normalized write for that event without throwing into Drive; the Drive run proceeds with unchanged legacy events and unchanged task/run outcome
- Seam: `lib/driver/durable-events.ts`, `lib/driver/driver.ts`, `lib/driver/run-step.ts`, `lib/driver/event-stream.ts`
- Test: `tests/driver/driver-durable-dual-write.test.ts` > `continues the drive run when run record creation fails before the first event`
- Marker: `@cosmo-behavior plan:durable-run-store-events#B-017`

## Design

### Module boundaries

- `lib/durable-runtime/types.ts` (new): Owns generic persisted contracts only: `RunRef`, `RunRecord`, Plan-1 subset `StepRecord`, `ArtifactRef`, `RunResult`, `StepResult`, `FileChangeSummary`, `VerificationResult`, `CommitRef`, `RunPolicy` subset, `WorktreeSpec`, canonical `OrchestrationEvent`, `StoredOrchestrationEvent`, `RunStatusSummary`, `RunWatchResult`, diagnostics, and narrow input types for store/controller functions. It has no filesystem, Drive, CLI, Pi, task, or prompt imports.
- `lib/durable-runtime/file-store.ts` (new): Owns file-backed `RunStore` implementation under `missions/sessions/<scope>/runs/<runId>/`. It performs path-safety validation, path normalization for run-owned paths, atomic JSON writes for records, JSONL appends for normalized events, step record persistence, run loading, recent-run listing, and status delegation. It imports only Node filesystem/path APIs and durable-runtime types.
- `lib/durable-runtime/controller.ts` (new): Owns read-only `runStatus`, `runWatch`, and pure `summarizeRunStatus(record, events)` logic over normalized events. It is the only generic status summarizer for normalized events. Store implementations and extensions call this module instead of duplicating normalized status logic.
- `lib/durable-runtime/index.ts` (new): Re-exports the public durable-runtime API.
- `lib/driver/durable-events.ts` (new): The Drive compatibility adapter. It is the only module that imports both `lib/driver/types.ts` and `lib/durable-runtime/*`. It translates `DriverEvent` to canonical normalized events or explicit legacy-only diagnostics, lazily creates/adopts a Drive `RunRecord`, and provides a dual-write event sink wrapper.
- `lib/driver/event-stream.ts` (existing): Remains the legacy Drive event sink/tail implementation. Do not convert it to normalized events in this plan.
- `lib/driver/driver.ts` and `lib/driver/run-step.ts` (existing): Compose Drive's legacy sink with the new Drive durable sink for inline and detached execution without changing Drive execution order or CLI behavior.
- `cli/drive/subcommand.ts` (existing): Keeps legacy status/list/resume behavior. The only planned runtime change is that resume finalization event appends also pass through the Drive durable sink after the legacy append succeeds.
- `domains/shared/extensions/orchestration/run-control-tools.ts` (new): Registers read-only `run_status` and `run_watch` tools backed by `lib/durable-runtime/controller.ts`.
- `domains/shared/extensions/orchestration/index.ts` (existing): Registers the new read-only tools alongside existing orchestration tools. It must not register mutating runtime controls.

### Contracts

The store boundary is scope-aware and backend-agnostic:

```ts
interface RunRef {
  scope: string;
  runId: string;
}

interface RunStore {
  createRun(input: CreateRunInput): Promise<RunRecord>;
  loadRun(ref: RunRef): Promise<RunRecord | undefined>;
  updateRun(record: RunRecord): Promise<RunRecord>;
  appendEvent(ref: RunRef, event: OrchestrationEvent): Promise<StoredOrchestrationEvent>;
  readEvents(ref: RunRef, options?: { sinceSeq?: number; limit?: number }): Promise<RunWatchResult>;
  writeStepRecord(ref: RunRef, step: StepRecord): Promise<StepRecord>;
  readStepRecord(ref: RunRef & { stepId: string }): Promise<StepRecord | undefined>;
  listRecentRuns(options?: { scope?: string; limit?: number }): Promise<RunRecord[]>;
  readStatus(ref: RunRef): Promise<RunStatusSummary | undefined>;
}
```

Plan-1 `RunRecord` uses the canonical architecture field names and includes a minimal `RunPolicy` data shape sufficient for persistence: `reportInference`, optional cost/token/timeout limits, `defaultBackend: { name: string; [key: string]: unknown }`, and `worktree: WorktreeSpec` defaulting to `{ mode: "shared" }`. Plan 1 does not introduce `OrchestrationBackend`, backend capabilities, backend handles, leases, attempts, retries, or scheduler behavior; Plan 2 may extend the persisted `defaultBackend` data without renaming it.

Plan-1 `StepRecord` is a persisted subset of the architecture target: it includes `id`, `runId`, `title`, `kind`, `dependsOn`, `status`, `inputArtifacts`, `outputArtifacts`, and optional `result`. It does not include leases, heartbeats, retries, attempts, or adapter execution fields. Drive may reference task IDs as normalized `stepId`s in events, but Drive task/finalizer `StepRecord` population remains Plan 2 scope.

Every normalized event is stored in this envelope:

```ts
interface StoredOrchestrationEvent {
  seq: number;
  timestamp: string;
  runId: string;
  event: OrchestrationEvent;
}
```

`seq` is assigned by the store per run. `run_watch`, `run_status`, and future recovery read by `seq`, not JSONL line position.

Terminal `OrchestrationEvent` variants must be exactly the field sets defined in `missions/architecture/durable-orchestration-runtime.md` Core Contracts. In Plan 1 this specifically means:

```ts
type CanonicalTerminalExamples =
  | { type: "step_completed"; runId: string; stepId: string; result: StepResult }
  | { type: "step_failed"; runId: string; stepId: string; reason: string }
  | { type: "step_blocked"; runId: string; stepId: string; reason: string }
  | { type: "run_completed"; runId: string; result: RunResult }
  | { type: "run_failed"; runId: string; reason: string };
```

Do not add `details`, progress, contradicted paths, retryability, finalization phase/task/commit, source Drive outcome, or result fields to `step_blocked`, `step_failed`, or `run_failed`. Rich evidence belongs in a preceding `step_tool_activity` event, an `artifact_written` event, a completed-event `StepResult`/`RunResult`, or a controller diagnostic.

Run-owned paths are normalized as follows: `createRun` resolves relative `graphPath`, `eventsPath`, `artifactsDir`, and `schedulerStatePath` against the scoped run directory; absolute paths must still resolve inside that run directory. Missing event files are created on append. Paths outside the run directory are rejected. The Drive `orchestration-events.jsonl` sidecar is a run-owned file inside the same run directory and does not create an outside-path exception.

The Drive adapter contract is explicit about skipped legacy-only events, diagnostics, lazy setup, and multi-event mappings:

```ts
interface DriverEventNormalizationDiagnostic {
  type: DriverEvent["type"];
  reason: string;
  details?: unknown;
}

interface DriverEventNormalization {
  events: OrchestrationEvent[];
  legacyOnly?: { type: DriverEvent["type"]; reason: string };
  diagnostics?: DriverEventNormalizationDiagnostic[];
}

function normalizeDriverEvent(event: DriverEvent): DriverEventNormalization;

function createDriveDurableEventSink(options: {
  spec: DriverRunSpec;
  store?: RunStore;
  normalizedEventsFilename?: string; // Drive default: orchestration-events.jsonl
  onDiagnostic?: (diagnostic: DriverEventNormalizationDiagnostic, event: DriverEvent) => void;
  onError?: (error: unknown, event: DriverEvent) => void;
}): EventSink;

function createDualWriteEventSink(options: {
  legacySink: EventSink;
  durableSink: EventSink;
  onDurableError?: (error: unknown, event: DriverEvent) => void;
}): EventSink;
```

`normalizeDriverEvent` may emit multiple normalized events for one legacy event; when a legacy event contains both rich evidence and a terminal transition, evidence events must appear before the canonical terminal event in the returned array so store-assigned `seq` preserves the relationship.

`createDriveDurableEventSink` must be construction-safe: constructing the sink must not write files or create/adopt `run.json`. Run-record creation/adoption happens lazily inside the durable sink after the legacy sink has accepted the event. If lazy setup fails before the first normalized event, the durable sink reports diagnostics through `onError`/`onDiagnostic`, skips that normalized write, and never throws into Drive. Later events may retry setup or remain diagnostic-only, but Drive outcome and legacy event emission must be unchanged.

Dual-write order is compatibility-first: call and await the legacy sink exactly as today; then attempt lazy durable setup and normalized append; swallow/report normalized setup or append failures; never let normalized failures become legacy `EventLogWriteError`.

### Run status synchronization

`RunRecord.status` is a cached persisted status; the normalized terminal event stream is the durable source of truth for terminal state.

- Appending a terminal run event (`run_completed`, `run_failed`, `run_blocked`, `run_cancelled`, or `run_stale`) should update `run.json.status` and `updatedAt` after the event append succeeds.
- Terminal event payloads remain canonical. Any Drive-specific finalization/aborted/blocked evidence that status output needs must be read from preceding `step_tool_activity` events or controller diagnostics, not from extra fields on terminal events.
- If the status update fails after the event append, the event remains the source of truth and `runStatus` reports the event-derived status with diagnostic detail about the stale record status when available.
- If `run.json.status` is terminal but no matching terminal event exists, `runStatus` reports the record status and includes `statusSource: "record"` so the missing event is visible.
- `updateRun` must not silently downgrade a terminal status to non-terminal in Plan 1; callers that need retry/resume transitions belong to later scheduler plans.

### Drive event mapping rules

Drive mapping must conform to the architecture Core Contracts. Where the current Drive event contains data that the canonical event does not, the translator emits `step_tool_activity` first when a `stepId` exists, or records controller diagnostics when there is no canonical activity event available. It must never extend terminal variants locally.

- `run_started` -> `run_started`; Drive `planSlug`, backend, and mode are preserved through the Drive-created `RunRecord` fields/policy and diagnostics, not by adding fields to `run_started`.
- `task_started` -> `step_ready` with Drive task ID as `stepId`; no backend is invented before `spawn_started`.
- `spawn_started` -> `step_started` with the backend from Drive.
- `driver_activity` -> `step_tool_activity` with the activity payload under `details`.
- `spawn_completed` -> `step_tool_activity` with parsed report detail. Report evidence may shape a later `StepResult` only through the allowed `step_completed.result` field; the report details themselves remain in activity evidence.
- `spawn_failed` -> `step_tool_activity` with error/exit-code/contradicted details; Drive task terminal status is still owned by a following terminal task/preflight event when one exists.
- `preflight` with `status: "started"` or `status: "passed"` -> `step_tool_activity` only.
- `preflight` with `status: "failed"` -> `step_tool_activity` containing the preflight details, then canonical `step_blocked` with `reason` derived from `details.stderr`, branch mismatch details, or a fallback `preflight failed` reason. This covers the current Drive path where failed preflight returns a blocked task outcome without emitting legacy `task_blocked`.
- `verify`, `finalize`, and `commit_made` -> `step_tool_activity` or `artifact_written` only when the canonical fields are available; otherwise preserve exact Drive evidence under activity `details`. Do not create finalizer steps in Plan 1.
- `task_done` -> `step_completed` with `StepResult.outcome: "success"`; optional files/verification/commit evidence may appear only inside the `StepResult` if the adapter has that evidence, otherwise it remains in preceding activity events.
- `task_blocked` -> `step_tool_activity` containing Drive reason/progress/contradicted-path evidence, then canonical `step_blocked` with `reason` only.
- `task_finalization_failed` -> `step_tool_activity` containing Drive finalization phase, retryable flag, commit, and reason details, then canonical `step_failed` with `reason` only.
- `run_completed` -> `run_completed` with `RunResult.outcome: "completed"`, summary, `tasksDone`, and `tasksBlocked` in the canonical result field.
- `run_aborted` -> canonical `run_failed` with `reason` only. Source outcome `aborted` is exposed as a diagnostic and any related task evidence must have been captured by failed-preflight/task-blocked/partial activity when a task context exists; do not add a generic `aborted` run status.
- `run_finalization_failed` -> if `taskId` is present, emit `step_tool_activity` with phase/task/commit/reason details before the run terminal event; if no `taskId` exists, preserve those details as diagnostics. In all cases, emit canonical `run_failed` with `reason` only and do not add a generic `finalization_failed` status.
- `lock_warning` and `plan_completion_candidate` -> no normalized event in Plan 1 because the architecture record has no run-level advisory/activity event variant. The translator returns `legacyOnly` diagnostics for these events and leaves their visibility to the legacy Drive stream. Do not fabricate a step ID, backend, artifact, details field, or terminal run event for them.

### Decision log

- Chosen: keep legacy Drive `events.jsonl` untouched and write normalized Drive events to `orchestration-events.jsonl` for Plan 1, as explicitly authorized by the architecture record's Storage Layout compatibility note.
  - Alternative: move normalized events to root `events.jsonl` immediately and make `watch_events` a compatibility view.
  - Why: immediate root migration would change existing `watch_events` structured results and resume/status assumptions, violating `D-003` and the explicit wave-1 scope.
- Chosen: keep terminal `OrchestrationEvent` variants canonical and move rich Drive evidence to preceding activity events or diagnostics.
  - Alternative: extend `step_blocked`, `step_failed`, or `run_failed` locally with Drive detail fields.
  - Why: the architecture Core Contracts are the source of truth; local terminal extensions would fracture recovery/status semantics before scheduler work begins.
- Chosen: add a Drive adapter under `lib/driver/` instead of a Drive adapter under `lib/durable-runtime/`.
  - Alternative: put `drive-events.ts` inside `lib/durable-runtime/`.
  - Why: generic runtime must not depend on Drive types; Drive depends inward on runtime contracts.
- Chosen: make Drive durable run-record setup lazy and failure-isolated.
  - Alternative: create/adopt `run.json` eagerly when constructing the event sink.
  - Why: existing Drive constructs event sinks before entering the run loop; eager setup failure would break Drive before the legacy sink can write the first event.
- Chosen: expose read-only observation through `run_status`/`run_watch` while leaving current `watch_events` in place.
  - Alternative: replace `watch_events` with normalized reads.
  - Why: `watch_events` is current Drive compatibility; normalized observation should be additive in Plan 1.
- Chosen: legacy-only Drive advisory events remain legacy-only in Plan 1.
  - Alternative: add a new generic `run_activity` event variant or fabricate step/artifact data.
  - Why: the architecture record does not define a run-level advisory variant; preserving architectural fidelity is safer than inventing data to force every legacy event into the normalized stream.

## Files to Change

- `missions/architecture/durable-orchestration-runtime.md` - already updated in `## Storage Layout` with the Plan-1 Drive `orchestration-events.jsonl` sidecar authorization; implementers must preserve the D-00x decisions and target layout.
- `lib/durable-runtime/types.ts` - create generic run, step, policy, result, artifact, canonical event, store input/output, diagnostics, and summary types.
- `lib/durable-runtime/file-store.ts` - create file-backed `RunStore` implementation and path-safety utilities.
- `lib/durable-runtime/controller.ts` - create `runStatus`, `runWatch`, and pure normalized status summarization helpers.
- `lib/durable-runtime/index.ts` - create public durable-runtime exports.
- `lib/driver/durable-events.ts` - create Drive event translator, lazy Drive run-record adapter, legacy-only diagnostics, canonical terminal mapping, failed-preflight mapping, and dual-write sink helpers.
- `lib/driver/driver.ts` - change inline Drive sink composition to dual-write after the legacy sink, with lazy/failure-isolated durable setup.
- `lib/driver/run-step.ts` - change detached child sink composition to dual-write after the legacy sink, with lazy/failure-isolated durable setup.
- `cli/drive/subcommand.ts` - change resume finalization event appends to dual-write while preserving legacy status/list/resume logic.
- `domains/shared/extensions/orchestration/run-control-tools.ts` - create read-only `run_status` and `run_watch` tool registrations.
- `domains/shared/extensions/orchestration/index.ts` - register the new read-only tools; do not register mutating controls.
- `domains/shared/capabilities/drive.md` - document that `watch_events` remains legacy Drive observation and `run_status`/`run_watch` are normalized read-only helpers.
- `lib/driver/README.md` - document the Plan-1 normalized event sidecar file, canonical terminal mapping, lazy durable setup, and Drive compatibility guarantee.
- `tests/durable-runtime/file-store.test.ts` - create store/layout/sequence/step-safety tests with B-001, B-002, and B-003 markers.
- `tests/durable-runtime/controller.test.ts` - create normalized `run_watch`/`run_status` helper tests with B-012 and B-013 markers.
- `tests/driver/durable-events.test.ts` - create Drive event translation tests with B-004, B-005, and B-015 markers.
- `tests/driver/driver-durable-dual-write.test.ts` - create dual-write integration/failure/read-path tests with B-006, B-007, B-016, and B-017 markers.
- `tests/cli/drive/status.test.ts` - add status compatibility test with B-008 marker.
- `tests/cli/drive/list.test.ts` - add list compatibility test with B-009 marker.
- `tests/cli/drive/run.test.ts` - add resume compatibility/dual-write test with B-010 marker.
- `tests/extensions/orchestration-watch-events.test.ts` - add legacy `watch_events` coexistence test with B-011 marker.
- `tests/extensions/orchestration-run-control.test.ts` - create read-only tool registration/execution tests with B-014 marker.

Files intentionally not changed:

- `lib/orchestration/*` - no chain compiler or chain event migration in Plan 1.
- `lib/driver/backends/*` - no backend adapter migration in Plan 1.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` behavior - remains legacy Drive event observation; only tests may be added around coexistence unless a tiny import/export adjustment is required.

## Risks

- **Legacy `events.jsonl` conflicts with the architecture's normalized filename.** Mitigation: the architecture record now explicitly authorizes the Drive Plan-1 `orchestration-events.jsonl` sidecar while preserving generic target layout; default generic store can still produce the architecture layout. Pivot if an implementation tries to change legacy `watch_events` structured output in this plan.
- **Terminal event shape drift could fork the architecture contract.** Mitigation: B-004/B-005/B-015 require canonical terminal fields exactly; rich Drive evidence goes to activity events or diagnostics. Reviewer should reject any `details`, progress, retryable, phase/task/commit, or source outcome fields on `step_blocked`, `step_failed`, or `run_failed`.
- **Dual-write failures could accidentally alter Drive behavior.** Mitigation: legacy sink is awaited first; durable setup is lazy and failure-isolated; normalized setup/append failures are swallowed/reported; B-007 and B-017 prove the run outcome does not change. Abort the approach if normalized writes must become required for Drive completion.
- **Translator could overfit to Drive and pollute generic runtime contracts.** Mitigation: Drive-specific payloads stay in `lib/driver/durable-events.ts` activity details and diagnostics; legacy-only diagnostics avoid fabricating fields the architecture does not define. Reviewer should reject any `lib/durable-runtime/*` import from Drive.
- **Run record and event stream status could drift.** Mitigation: terminal normalized events are source of truth; appends update cached `RunRecord.status`; B-013 covers stale-record disagreement and B-016 proves Drive-produced sidecars are readable by controller helpers.
- **Scope creep into scheduler or backend adapters.** Mitigation: graph/scheduler files are inert placeholders; no leases, heartbeats, retries, backend adapters, or step attempts are implemented. If a behavior seems to need scheduler ownership, defer it to Plans 2 or 3 instead of expanding this plan.
- **New read-only tools might duplicate status logic.** Mitigation: `run_status`/`run_watch` call `lib/durable-runtime/controller.ts`; existing Drive CLI status remains legacy compatibility, not a second normalized status implementation.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness evidence passes for targeted behavior tests and the repository's configured test, lint, and typecheck checks | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for `plan:durable-run-store-events`: every B-### has all required fields, root-relative test references, and exact markers in the referenced tests after implementation | artifact evidence | hard fail after the implementation creates the referenced tests |
| 3 | `mutation` | bindable | unbound | Targeted negative tests prove realistic faults would fail: unsafe path IDs (B-003), fabricated backend/step data or non-canonical terminal fields (B-004/B-005), dangling failed-preflight steps (B-015), dropped/rewritten legacy events (B-006/B-011), normalized append or lazy setup failure changing Drive outcome (B-007/B-017), status/list/resume reading normalized data by mistake (B-008/B-009/B-010), controller ignoring a Drive-produced `eventsPath` sidecar (B-016), stale run-record status winning over terminal events (B-013), and mutating controls being registered (B-014) | project tests + reviewer judgment | no mutation tool is bound; degraded to targeted negative tests and reviewer reasoning |
| 4 | `boundary-conformance` | bindable | bound | No `lib/durable-runtime/*` file imports `lib/driver/*`, `cli/*`, `domains/*`, prompts, or task-management modules; no scheduler/backend adapter modules are introduced in this plan; terminal event variants in `lib/durable-runtime/types.ts` match the architecture Core Contracts | reviewer/static inspection, optionally grep-backed | hard fail if dependency direction, canonical contracts, or wave-1 scope is violated |
| 5 | `dead-code` | bindable | unbound | Public exports are limited to the planned `RunStore`, file store, controller, and Drive adapter APIs; no unused backend/scheduler stubs are added | lint/typecheck + reviewer judgment | unbound for conceptual dead code; reviewer must reject speculative stubs |

Project binding notes for the correctness gate: `package.json` defines the repository checks as `test`, `lint`, and `typecheck`; in this project they are executed as `bun run test`, `bun run lint`, and `bun run typecheck`.

## Implementation Order

1. **Characterize compatibility first.** Add B-008, B-009, B-010, and B-011 tests around existing Drive status/list/resume/watch behavior with normalized files present. B-008, B-009, and B-011 are expected to pass against current behavior when tests manually seed `run.json` and `orchestration-events.jsonl`, because current status/list/watch paths already ignore those normalized files. Only the parts that require new dual-write resume plumbing or new runtime helpers should start red.
2. **Add durable-runtime types and file store.** Write B-001, B-002, and B-003 tests, then implement `lib/durable-runtime/types.ts`, `file-store.ts`, and `index.ts`. Keep `OrchestrationEvent` terminal variants exactly canonical, and keep the implementation file-backed, scope-aware, path-safe, and scheduler-free.
3. **Add read-only normalized controller helpers.** Write B-012 and B-013 tests, implement `controller.ts`, and make file-store `readStatus` delegate to the same pure summary logic rather than duplicating it. Status diagnostics may inspect adjacent activity events, but must not require non-canonical terminal fields.
4. **Add read-only tools.** Write B-014 tests, implement `run-control-tools.ts`, and register only `run_status`/`run_watch` in the orchestration extension. Do not touch mutating control names.
5. **Add Drive event translation.** Write B-004, B-005, and B-015 tests, then implement `lib/driver/durable-events.ts`. The translator may emit activity/detail events before terminal events, but canonical terminal events must carry only architecture-defined fields. Failed preflight must produce a terminal `step_blocked` so no normalized step is left dangling. Return legacy-only diagnostics for Drive events that have no canonical normalized variant.
6. **Integrate Drive dual-write.** Write B-006, B-007, B-016, and B-017 tests, then change `lib/driver/driver.ts`, `lib/driver/run-step.ts`, and resume event appends in `cli/drive/subcommand.ts` to compose legacy and durable sinks. Preserve legacy event write/publish ordering; make durable run-record setup lazy and failure-isolated; prove a fake-backend Drive run's produced `run.json.eventsPath` feeds `runStatus`/`runWatch` correctly.
7. **Document and verify.** Update `lib/driver/README.md` and `domains/shared/capabilities/drive.md`; run the full Quality Contract gates. If any step requires scheduler ownership, backend adapter changes, fabricated normalized fields, non-canonical terminal events, or legacy `watch_events` replacement, stop and split that work into the later durable-runtime plans rather than expanding this plan.

## Reviewer Resolution

- `PR-001` - Resolved by making the architecture Core Contracts canonical in B-004/B-005, the Contracts section, Run status synchronization, and Drive mapping rules. `step_blocked`, `step_failed`, and `run_failed` now carry only `reason`; only `step_completed`/`run_completed` carry `StepResult`/`RunResult`; rich Drive evidence moves to preceding `step_tool_activity`, `artifact_written`, completed-event results, or controller diagnostics.
- `PR-002` - Resolved by adding B-015 and explicit Drive mapping for failed `preflight`: emit `step_tool_activity(details)` followed by canonical `step_blocked{reason}` for branch-mismatch and command-failure cases so a normalized step is not left dangling.
- `PR-003` - Resolved by updating `missions/architecture/durable-orchestration-runtime.md` `## Storage Layout` with the authorized Plan-1 Drive `orchestration-events.jsonl` sidecar exception and by referencing that authorization in this plan's Architecture Context, Design decision log, Files to Change, and Risks.
- `PR-004` - Resolved by adding B-016, an end-to-end fake-backend Drive run integration test that follows the produced `run.json.eventsPath` and verifies `runStatus`/`runWatch` read the Drive-produced normalized sidecar.
- `PR-005` - Resolved by specifying construction-safe, lazy, failure-isolated Drive durable sink setup in the adapter contract and by adding B-017 for run-record creation/adoption failure before the first event.
- `PR-006` - Resolved by clarifying Implementation Order step 1: B-008, B-009, and B-011 compatibility characterization tests should pass against current behavior when normalized files are manually seeded; only new helper/dual-write-dependent portions should start red.
- `PR-007` - Resolved by reordering the Quality Contract ladder so `mutation` precedes `boundary-conformance` per the artifact gate ordering.
