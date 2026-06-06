---
title: 'Durable Runtime Phase 2: Backend and Step Model'
status: completed
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-06T14:31:22.060Z'
---

## Overview

Make the durable runtime model concrete around Drive task execution while Drive still owns its current loop. Plan 1 (`durable-run-store-events`) is done and merged: `lib/durable-runtime/{types,file-store,controller,status,index}.ts` and `lib/driver/durable-events.ts` already provide file-backed run records, step-record storage, normalized event dual-write, and read-only `run_status`/`run_watch` helpers. This plan extends that substrate with backend adapter contracts, richer persisted `StepRecord`/attempt/result data, and Drive finalizer step records.

`missions/plans/durable-backend-step-model/spec.md` uses Functional Requirements Seed items rather than explicit acceptance-criterion IDs. For behavior mapping, this plan normalizes those seeds in order:

- `AC-001` - A generic `OrchestrationBackend` contract exists for `prepare`, `start`, optional `resume`, and optional `cancel`, with runtime-owned adapter types.
- `AC-002` - Existing Drive backends (`codex`, `claude-cli`, and `cosmonauts-subagent`) can be represented through the generic adapter layer without changing their current invocation behavior.
- `AC-003` - Generic `StepRecord` persistence captures Drive task execution state, backend identity, input/output artifacts, status, attempts under `steps/<stepId>/attempts/<attemptId>/`, and terminal `StepResult` evidence.
- `AC-004` - Drive finalization phases are modeled as generic `finalizer` step records without weakening current `finalization_failed` recovery.
- `AC-005` - Step results distinguish backend completion, intended work completion, artifacts, verification, commits, and scheduler next action; malformed or missing backend reports produce `unknown`, never silent success.

Wave-1 scope remains compatibility-first: Drive task execution behavior and Drive CLI output stay unchanged; the scheduler, graph compiler, chain migration, broad parallelism, worktree merge finalization, and mutating controller controls stay out of this plan.

## Architecture Context

This plan implements Plan 2 from `missions/architecture/durable-orchestration-runtime.md`. The architecture record is the source of truth for contract names, storage layout, backend identifiers, and the durable orchestration decision log.

Relevant decisions and Plan-2 implications:

- `D-001 - One runtime, multiple frontends`: backend, step, attempt, and result contracts live in `lib/durable-runtime/*` and stay generic enough for Drive now and chains/workflows later.
- `D-002 - File-backed first`: attempts and results are inspectable under the existing `missions/sessions/<scope>/runs/<runId>/steps/` layout; no SQLite/daemon abstraction is introduced.
- `D-003 - Drive compatibility before chain migration`: Drive remains the behavior owner; this plan describes and records Drive task/finalizer execution without routing Drive through a scheduler or changing CLI output.
- `D-004 - No default hard timeout for durable runs`: existing Drive `taskTimeoutMs` remains in Drive; runtime backend contracts do not add a new hard-timeout default.
- `D-005 - Normalized events with backend details`: existing normalized events remain canonical; step records preserve richer backend/finalizer evidence without adding Drive-specific fields to terminal event variants.
- `D-006 - Step results must distinguish unknown from success`: malformed, missing, or ambiguous backend reports persist `StepResult.outcome: "unknown"` even when a backend exits zero. For actual Drive durable writes, the same unknown result is used in the task step record, attempt result, and normalized `step_completed.result` so `run_watch` does not report a false step success.
- `D-007 - First scheduler is local and sequential-first`: this plan records Drive’s current sequential task order as dependencies where useful, but adds no scheduler-owned loop and no new parallel mutable execution.
- `D-008 - Durable chains start narrow`: no chain compiler, chain backend migration, or loop migration is introduced.
- `D-009 - Wave-1 controller surface is read-only`: existing `run_status`/`run_watch` remain observation helpers; no `run_pause`, generic `run_resume`, `run_cancel`, or `run_intervene` is added.
- `D-010 - Scheduler runs in-process for wave 1`: backend contracts must not assume a live interactive caller; this plan still does not instantiate a scheduler.

Boundary rules this plan must preserve:

- `lib/durable-runtime/*` must not import `lib/driver/*`, `cli/*`, `domains/*`, prompt/persona files, or task-management modules.
- Drive compatibility modules may import durable-runtime contracts, but generic runtime modules do not import Drive types.
- Existing `watch_events` continues to read the legacy Drive `events.jsonl`; `run_watch` continues to read normalized `RunRecord.eventsPath`; Drive status/list continue to classify from legacy files. Step records do not add new CLI/tool fields in this plan.
- Existing `cosmonauts drive status`, `drive list`, and `drive run --resume` continue to classify/recover from `run.completion.json`, `run.pid`, `run.inline.json`, `pending-finalization.json`, and legacy Drive events exactly as today.
- Drive backend wrappers adapt current `Backend` instances; they must not fork prompt rendering, backend invocation, report parsing, postflight verification, commit policy, or finalization behavior.

## Behaviors

### B-001 - Runtime owns generic backend and attempt contracts

- Source: AC-001, AC-003
- Context: a worker imports the durable runtime public API before any Drive-specific adapter code is involved
- Action: the API exposes `KnownBackendName`, compatibility `BackendName`, `BackendSpec`, `BackendCapabilities`, `BackendContext`, `PreparedStep`, `BackendHandle`, `OrchestrationBackend`, and `StepAttemptRecord`, and the test inspects durable-runtime source imports
- Expected: `KnownBackendName`/`BackendName`/`BackendSpec` are declared only in `lib/durable-runtime/types.ts`; `lib/durable-runtime/backends.ts` imports those persisted types and declares only backend execution contracts; the contracts compile without importing Drive, CLI, domains, prompts, or task-management modules; `StepRecord` includes generic `backend`, `latestAttemptId`, input/output artifact, status, and `result` fields; `RunStore` exposes attempt persistence methods; known wave-1 backend names include `codex`, `claude-cli`, `cosmonauts-subagent`, and `shell-command`; the existing Plan-1 generic default backend value `unknown` remains allowed only as an unconfigured compatibility value for run policies and has no adapter
- Seam: `lib/durable-runtime/types.ts`, `lib/durable-runtime/backends.ts`, `lib/durable-runtime/index.ts`, `lib/driver/types.ts`
- Test: `tests/durable-runtime/backend-contracts.test.ts` > `defines generic backend and attempt contracts without Drive dependencies`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-001`

### B-002 - Drive backend adapters preserve existing backend invocation

- Source: AC-001, AC-002
- Context: a current Drive `Backend` implementation receives a fully rendered `BackendInvocation` from the existing Drive code path, and the adapter is constructed with the configured `KnownBackendName` from `DriverRunSpec.backendName`
- Action: the backend is wrapped as an `OrchestrationBackend`, then `prepare` and `start` are called with that invocation
- Expected: the underlying `Backend.run(invocation)` is called exactly once with the same invocation fields and abort signal; `exitCode`, `stdout`, and `durationMs` are returned unchanged; adapter identity comes from the configured known backend name, not from arbitrary `Backend.name`; test fakes may keep arbitrary `Backend.name` values but must pass a real configured name when adapted; unsupported `resume` and `cancel` are explicit rather than pretending to work; no prompt rendering, report parsing, verification, commit, or finalization logic is duplicated in the adapter; current Drive backend capabilities are pinned as `codex = { canResume: false, canCancel: false, canCommit: false, isolatedFromHostSource: true, emitsMachineReport: true }`, `claude-cli = { canResume: false, canCancel: false, canCommit: true, isolatedFromHostSource: true, emitsMachineReport: true }`, and `cosmonauts-subagent = { canResume: false, canCancel: false, canCommit: true, isolatedFromHostSource: false, emitsMachineReport: true }`
- Seam: `lib/driver/backends/orchestration-adapter.ts`, `lib/driver/backends/types.ts`, `lib/driver/backends/{codex,claude-cli,cosmonauts-subagent}.ts`
- Test: `tests/driver/backends/orchestration-adapter.test.ts` > `starts wrapped Drive backends with unchanged invocations and pinned capabilities`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-002`

### B-003 - The file store persists step attempts without erasing evidence

- Source: AC-003, AC-005
- Context: a run already has a `StepRecord`, and Drive or a future scheduler records more than one attempt for that step
- Action: the store writes `attempt-001` with output/result evidence, then writes `attempt-002` and updates the step’s `latestAttemptId`
- Expected: each attempt is stored under `steps/<stepId>/attempts/<attemptId>/` with its own `attempt.json`, `output.md` when output/report text evidence is provided, and `result.json` when a `StepResult` is terminal; the second attempt does not overwrite the first; `readStepAttemptRecord` and `listStepAttemptRecords` return attempt records in stable order; unsafe attempt IDs are rejected before writing outside the run directory
- Seam: `lib/durable-runtime/file-store.ts`, `lib/durable-runtime/types.ts`
- Test: `tests/durable-runtime/file-store.test.ts` > `persists step attempts and results without erasing previous attempts`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-003`

### B-004 - Drive task execution writes generic task step records

- Source: AC-002, AC-003, AC-005
- Context: an inline Drive run executes tasks with the current prompt rendering, backend invocation, postflight, and commit policies; the actual `Backend.name` may be a programmatic/test fake even though `DriverRunSpec.backendName` is one of the configured Drive backend names
- Action: the Plan-2 durable sink observes the existing Drive events and projects them into persisted task `StepRecord`s
- Expected: `steps/<taskId>/step.json` has `kind: "drive"`, `backend.name` from the authoritative configured Drive identity `DriverRunSpec.backendName`, sequential dependencies derived from the original run task order persisted in `RunRecord.metadata.driveTaskIds` on initial run creation, deterministic prompt/task input artifacts where Drive can identify them, current status, `latestAttemptId`, and terminal `StepResult`; when a resumed run rewrites the active `DriverRunSpec.taskIds` to the remaining task slice, dependencies for resumed task steps still point to already-recorded earlier task steps from `metadata.driveTaskIds`; if a pre-Plan-2 run lacks that metadata, the projector falls back to the active spec slice and records a diagnostic rather than inventing dependencies. `spawn_started.backend`/`ctx.backend.name` remains legacy execution telemetry and normalized `step_started.backend` compatibility data; if it differs from `DriverRunSpec.backendName`, the projector records diagnostic/evidence but does not widen `BackendName` or write the fake name into `StepRecord.backend`. The matching attempt directory contains parsed report evidence (and `ParsedReport.raw` for unknown reports) rather than promising unavailable full raw stdout for structured reports; legacy Drive events and normalized event dual-write remain compatible.
- Seam: `lib/driver/durable-steps.ts`, `lib/driver/event-stream.ts`, `lib/driver/driver.ts`, `lib/driver/run-step.ts`
- Test: `tests/driver/driver-durable-steps.test.ts` > `writes Drive task step records with configured backend identity and resume-safe dependencies`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-004`

### B-005 - Drive retries append attempts instead of replacing prior evidence

- Source: AC-003
- Context: Drive retries a task attempt, such as the existing contradicted-block retry path that emits a first backend attempt and then a second attempt with an appended note
- Action: the durable step projector sees two `spawn_started`/terminal report sequences for the same task
- Expected: the first attempt remains readable under its original attempt directory; a new attempt directory is appended for the retry; `step.latestAttemptId` points at the retry attempt; the final task `StepResult` reflects only the latest terminal attempt while old attempt evidence remains inspectable
- Seam: `lib/driver/durable-steps.ts`, `lib/durable-runtime/file-store.ts`, `lib/driver/run-one-task.ts`
- Test: `tests/driver/durable-steps.test.ts` > `appends a new attempt when Drive retries a task`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-005`

### B-006 - Malformed backend reports persist as unknown in step records and normalized events

- Source: AC-005; architecture `D-006`
- Context: an external backend exits zero but emits prose with no fenced JSON report and no recognized `OUTCOME:`/`outcome:` marker; postflight or legacy Drive inference may later provide objective evidence and Drive may emit `task_done`
- Action: the Drive durable result mapper receives the existing `ParsedReport` with `outcome: "unknown"`, writes attempt/step results, and supplies the latest durable step result to the normalized `task_done` mapping
- Expected: the attempt `result.json`, task `StepRecord.result`, and actual normalized `step_completed.result` for that task all preserve `outcome: "unknown"` with a summary explaining the missing/malformed report; when legacy Drive later emits `task_done`, the task `StepRecord.status` is `"completed"` to reflect the Drive lifecycle event, but `result.outcome` remains `"unknown"` and `result.nextAction` is `"wait_for_human"` or absent, never `"continue"`; no durable success result is fabricated from exit code, prose, or a later legacy `task_done` event. Existing Drive CLI/task behavior is not changed by this stricter durable result record.
- Seam: `lib/driver/durable-steps.ts`, `lib/driver/durable-events.ts`, `lib/driver/event-stream.ts`, `lib/driver/report-parser.ts`, `lib/driver/run-one-task.ts`
- Test: `tests/driver/driver-durable-steps.test.ts` > `records malformed reports as completed unknown in step records and normalized events`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-006`

### B-007 - Drive finalization phases persist as generic finalizer steps

- Source: AC-004, AC-005
- Context: Drive emits existing `finalize` events for source commit, task status update, skipped finalization, and final task-state commit
- Action: the durable step projector records each finalization phase as a generic `StepRecord` with `kind: "finalizer"`
- Expected: source commit finalization uses a deterministic step ID such as `finalizer-source-commit-<taskId>`; task status uses `finalizer-task-status-<taskId>`; final state commit uses `finalizer-state-commit`; finalizer records use backend `{ name: "shell-command", ... }` as the wave-1 generic local-operation backend identity; passed/skipped phases finish with `StepResult.outcome: "success"`, commit references are captured when a SHA exists, and skipped reasons remain visible in the result summary
- Seam: `lib/driver/durable-steps.ts`, `lib/driver/run-one-task.ts`, `lib/driver/run-run-loop.ts`, `lib/driver/state-commit.ts`
- Test: `tests/driver/durable-finalizers.test.ts` > `projects Drive finalization phases into generic finalizer step records`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-007`

### B-008 - Finalization failures remain retryable finalizer failures, not behavioral task failures

- Source: AC-004
- Context: backend work and required verification have succeeded or reached their durable task result, but Drive cannot finish a source commit, task-status write, or final state commit and currently reports `finalization_failed`
- Action: Drive writes `pending-finalization.json`, emits existing finalization failure events, and the durable step projector records the failure
- Expected: the behavioral task `StepRecord` is not converted into a failed task solely because finalization failed; the failing finalizer step gets `status: "failed"`, a `StepResult` with `nextAction: "retry"`, and an artifact reference to `pending-finalization.json`; current `DriverResult.outcome: "finalization_failed"`, CLI status/list output, resume recovery evidence, and Plan-1 finalization normalized event shapes remain unchanged for compatibility
- Seam: `lib/driver/durable-steps.ts`, `lib/driver/durable-events.ts`, `lib/driver/run-one-task.ts`, `lib/driver/run-run-loop.ts`, `lib/driver/run-state.ts`, `cli/drive/subcommand.ts`
- Test: `tests/driver/durable-finalizers.test.ts` > `records finalization_failed as a retryable finalizer step without failing the task step`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-008`

### B-009 - Resume finalization appends a new finalizer attempt, including retry failures

- Source: AC-004
- Context: a previous Drive run has `pending-finalization.json`, `run.completion.json` with `outcome: "finalization_failed"`, and an existing failed finalizer step attempt
- Action: `cosmonauts drive run --resume <runId>` retries pending source commit, task status, or state commit recovery through the current compatibility path
- Expected: no backend task work is invoked before pending finalization recovery; existing pending-finalization success/failure behavior is unchanged; the failed finalizer attempt remains on disk; a new finalizer attempt is appended for the resume retry and records success or another retryable failure. Because current source-commit and task-status resume failure paths write `run.completion.json` without emitting terminal failure `DriverEvent`s, Plan 2 adds durable-only failure hooks for those paths rather than changing legacy event JSON. The same durable-only hook requirement applies to state-commit resume failures after `commitFinalState` returns `skipped` with `reason: "no_changes"` and `acceptExternalStateCommit` rejects recovery because a pending task is not `Done`, task files are still dirty, or `HEAD` is unchanged; those paths call `writeStateFinalizationFailure` without a terminal failure event today. stdout/stderr JSON shapes and exit codes remain the same as the current CLI tests expect.
- Seam: `cli/drive/subcommand.ts`, `lib/driver/event-stream.ts`, `lib/driver/durable-steps.ts`, `lib/driver/state-commit.ts`
- Test: `tests/cli/drive/run.test.ts` > `resume records source task-status and state-commit finalizer retry failures as attempts`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-009`

### B-010 - Durable step persistence failures do not alter Drive behavior

- Source: AC-002, AC-003
- Context: legacy Drive event logging is writable, but writing `steps/<stepId>/step.json` or an attempt/result file fails because the durable step path is unavailable or malformed
- Action: a Drive run emits events through the Plan-2 durable sink
- Expected: legacy `events.jsonl`, activity-bus publication, existing normalized event writes, task status updates, commits, pending finalization, and `DriverResult` continue according to current Drive behavior; durable step write failures are reported as diagnostics such as `drive_durable_step_write_failed` and are never converted into `EventLogWriteError`, task blocked, run aborted, or finalization failed. In-memory D-006 result context used for normalized events is maintained even if file persistence fails.
- Seam: `lib/driver/event-stream.ts`, `lib/driver/durable-steps.ts`, `lib/driver/driver.ts`, `lib/driver/run-step.ts`
- Test: `tests/driver/driver-durable-steps.test.ts` > `continues Drive run when durable step persistence fails`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-010`

### B-011 - Step records do not change legacy observation or add read-only tool fields

- Source: AC-002, AC-003; non-goal: no CLI behavior change
- Context: a Drive run directory contains legacy state files, normalized events, and Plan-2 `steps/` task/finalizer records
- Action: `watch_events`, `run_watch`, `run_status`, `cosmonauts drive status`, and `cosmonauts drive list` observe the run
- Expected: `watch_events` still reads legacy `DriverEvent` lines and line-count cursors; Drive status/list still classify from legacy state files; no CLI output gains step-record-derived fields. `run_watch` and `run_status` still summarize normalized events via `RunRecord.eventsPath`; the only Plan-2 normalized-result change is B-006’s correction that malformed-report task completions carry `StepResult.outcome: "unknown"` instead of a false success.
- Seam: `domains/shared/extensions/orchestration/watch-events-tool.ts`, `domains/shared/extensions/orchestration/run-control-tools.ts`, `lib/durable-runtime/controller.ts`, `cli/drive/subcommand.ts`
- Test: `tests/driver/driver-durable-steps.test.ts` > `keeps legacy observation outputs unchanged when step records exist`
- Marker: `@cosmo-behavior plan:durable-backend-step-model#B-011`

## Design

### Module boundaries

- `lib/durable-runtime/types.ts` (existing): The authoritative home for persisted backend identity vocabulary. Add/adjust `KNOWN_BACKEND_NAMES`, `KnownBackendName`, compatibility `BackendName`, `BackendSpec`, `StepKind`, `StepStatus`, `StepRecord.backend`, `StepRecord.latestAttemptId`, and `StepAttemptRecord`. Keep `RunRecord`, `RunPolicy`, `ArtifactRef`, `StepResult`, `RunResult`, and normalized event contracts generic. Keep the existing unconfigured backend policy default compatible; do not force false defaults such as `codex` for generic runs that did not select a backend.
- `lib/durable-runtime/backends.ts` (new): Own only execution-side contracts: `OrchestrationBackend`, `BackendCapabilities`, `BackendContext`, `PreparedStep`, and `BackendHandle`. It imports `KnownBackendName`, `BackendSpec`, `RunRecord`, and `StepRecord` from `types.ts`; it must not redeclare backend-name types and must not import Drive, CLI, domains, tasks, prompts, or backend implementations.
- `lib/durable-runtime/file-store.ts` (existing): Extend `FileRunStore` and `RunStore` with attempt persistence. Keep all run-owned step and attempt paths inside `RunRecord.stepsDir`; reject unsafe `stepId` and `attemptId` values; continue to update run status only from normalized run events, not from step records.
- `lib/durable-runtime/index.ts` (existing): Re-export the new backend contracts and attempt types.
- `lib/driver/types.ts` (existing): Keep the existing Drive `BackendName` export for `DriverRunSpec`, but derive its string vocabulary from durable-runtime `KnownBackendName` with `Extract<...>` rather than maintaining a second literal union. Use `import type` only; durable runtime still does not import Drive.
- `lib/driver/backends/orchestration-adapter.ts` (new): Wrap an existing Drive `Backend` as an `OrchestrationBackend`. It is the only adapter module that imports both durable-runtime backend contracts and Drive backend types. It takes the configured `KnownBackendName` explicitly from the caller and does not trust arbitrary `Backend.name` as persisted identity. It does not render prompts, parse reports, verify commands, commit changes, update tasks, or perform finalization.
- `lib/driver/durable-steps.ts` (new): Drive-specific step projector/recorder. It consumes existing `DriverEvent`s and `DriverRunSpec` context, writes generic task and finalizer `StepRecord`s and attempts through `RunStore`, maintains an in-memory latest task `StepResult` map for normalized event context, maps existing Drive report/finalization evidence into `StepResult`, compares configured backend identity to observed legacy backend telemetry, preserves original Drive task order from run metadata, and exposes durable-only hooks for resume failure paths that currently emit no terminal legacy event. This module may import `lib/driver/types.ts`, `lib/driver/report-parser.ts` types/helpers, and durable-runtime contracts. It must not change legacy Drive event shapes.
- `lib/driver/event-stream.ts` (existing): Compose the Plan-1 normalized durable event sink with the Plan-2 step projector after the legacy event write/publish succeeds. On first run creation, store `metadata.driveTaskIds = spec.taskIds` and `metadata.configuredBackendName = spec.backendName`; on resume, do not overwrite existing metadata with the remaining task slice. For `task_done`, pass the projector’s latest task result into `normalizeDriverEvent` so actual normalized `step_completed.result` honors D-006. Durable event and step failures remain isolated and diagnostic-only.
- `lib/driver/durable-events.ts` (existing): Keep canonical normalized events. Add an optional context parameter for `task_done` result mapping only. Do not retarget finalization failure normalized events in Plan 2; leave Plan-1 finalization event shapes unchanged and let finalizer `StepRecord`s carry the new recovery model. Keep `spawn_started.backend` normalized from the legacy event for Plan-1 compatibility; StepRecord backend identity is owned by the projector.
- `lib/driver/driver.ts` and `lib/driver/run-step.ts` (existing): Continue to create the event sink for inline and detached Drive runs. Do not change run modes, detached frozen runner behavior, backend selection, or task invocation behavior.
- `lib/driver/run-one-task.ts`, `lib/driver/run-run-loop.ts`, and `lib/driver/state-commit.ts` (existing): Remain owners of current Drive preflight, backend execution, postflight, commit, task-status, state-commit, and finalization recovery behavior. Do not move these behaviors into the generic runtime.
- `cli/drive/subcommand.ts` (existing): Keep status/list/resume behavior compatibility. Add durable-only recording calls for source-commit, task-status, and state-commit resume retry failures that emit no terminal legacy event; this includes `acceptExternalStateCommit` rejection paths after `commitFinalState` returns `skipped/no_changes`. Do not change legacy event JSON, dirty-worktree checks, JSON output shape, or exit-code behavior.
- `lib/driver/README.md` (existing): Document the Plan-2 backend wrapper, authoritative backend identity rule, step/attempt layout, D-006 unknown result rule, normalized-event correction for malformed reports, finalizer-step recovery model, and finalization normalized-event compatibility exception.

### Generic backend contract

`lib/durable-runtime/types.ts` owns persisted backend-name and backend-spec types:

```ts
export const KNOWN_BACKEND_NAMES = [
  "codex",
  "claude-cli",
  "cosmonauts-subagent",
  "shell-command",
] as const;

export type KnownBackendName = (typeof KNOWN_BACKEND_NAMES)[number];

// `unknown` is a compatibility value for existing generic RunPolicy defaults.
// It is not a backend adapter name and must not be used for Drive task/finalizer StepRecords.
export type BackendName = KnownBackendName | "unknown";

export interface BackendSpec {
  name: BackendName;
  options?: Record<string, unknown>;
}

// Preserve the Plan-1 public name while making BackendSpec authoritative.
export type BackendPolicy = BackendSpec;
```

`lib/durable-runtime/backends.ts` imports those types and owns only runtime execution contracts:

```ts
import type { BackendSpec, KnownBackendName, RunRecord, StepRecord } from "./types.ts";

export interface BackendCapabilities {
  canResume: boolean;
  canCancel: boolean;
  canCommit: boolean;
  isolatedFromHostSource: boolean;
  emitsMachineReport: boolean;
}

export interface BackendContext<TInput = unknown> {
  run: RunRecord;
  step: StepRecord;
  attemptId: string;
  input: TInput;
  signal?: AbortSignal;
  now?: () => string;
}

export interface PreparedStep<TInput = unknown> {
  step: StepRecord;
  attemptId: string;
  backend: BackendSpec;
  input: TInput;
  preparedAt: string;
}

export interface BackendHandle<TOutput = unknown> {
  backend: BackendSpec;
  stepId: string;
  attemptId: string;
  startedAt: string;
  result: Promise<TOutput>;
}

export interface OrchestrationBackend<TInput = unknown, TOutput = unknown> {
  name: KnownBackendName;
  capabilities: BackendCapabilities;
  prepare(step: StepRecord, ctx: BackendContext<TInput>): Promise<PreparedStep<TInput>>;
  start(prepared: PreparedStep<TInput>): Promise<BackendHandle<TOutput>>;
  resume?(step: StepRecord, ctx: BackendContext<TInput>): Promise<BackendHandle<TOutput>>;
  cancel?(handle: BackendHandle<TOutput>): Promise<void>;
}
```

The generic `BackendHandle.result` returns backend-specific output in Plan 2. Drive’s terminal `StepResult` is produced by `lib/driver/durable-steps.ts` from existing parsed reports and finalization events, specifically to avoid duplicating Drive report parsing inside the wrapper. Plan 3 may standardize scheduler-facing backend completion objects after it owns execution.

The Drive wrapper contract is:

```ts
export function createDriveBackendAdapter(
  backend: Backend,
  options: { name: KnownBackendName },
): OrchestrationBackend<BackendInvocation, BackendRunResult>;
```

For Drive backends, `prepare` stores the already-built `BackendInvocation`; `start` calls `backend.run(invocation)` with the same invocation object; `resume` is absent/unsupported because current Drive backends do not resume a single invocation; `cancel` is absent in Plan 2 because current Drive cancellation flows through the existing `AbortSignal` supplied before invocation start, not through a generic runtime control. A fake/programmatic `Backend.name` may be useful in legacy events and tests, but it never becomes an adapter or persisted step backend name unless the caller supplies one of the known configured names.

Pinned wave-1 capability values:

| Backend | canResume | canCancel | canCommit | isolatedFromHostSource | emitsMachineReport | Source in current code |
|---|---:|---:|---:|---:|---:|---|
| `codex` | false | false | false | true | true | `lib/driver/backends/codex.ts` has `canCommit: false`, `isolatedFromHostSource: true`; report emission is the Drive prompt/report contract, not a backend-native guarantee |
| `claude-cli` | false | false | true | true | true | `lib/driver/backends/claude-cli.ts` has `canCommit: true`, `isolatedFromHostSource: true`; report emission is the Drive prompt/report contract |
| `cosmonauts-subagent` | false | false | true | false | true | `lib/driver/backends/cosmonauts-subagent.ts` has `canCommit: true`, `isolatedFromHostSource: false`; report emission is the Drive prompt/report contract |
| `shell-command` | false | false | true | false | false | Plan-2 local finalizer/verifier identity; no adapter for Drive task execution |

### Step and attempt persistence

Extend `StepRecord` toward the architecture target without introducing scheduler-owned fields:

```ts
export type StepKind =
  | "agent"
  | "drive"
  | "chain"
  | "command"
  | "approval"
  | "finalizer";

export interface StepAttemptRecord {
  attemptId: string;
  startedAt: string;
  endedAt?: string;
  result?: StepResult;
}

export interface StepRecord {
  id: string;
  runId: string;
  title: string;
  kind: StepKind;
  backend: BackendSpec;
  dependsOn: string[];
  status: StepStatus;
  inputArtifacts: ArtifactRef[];
  outputArtifacts: ArtifactRef[];
  result?: StepResult;
  latestAttemptId?: string;
}
```

`FileRunStore` adds attempt methods to the existing `RunStore` interface:

```ts
writeStepAttemptRecord(
  ref: RunRef & { stepId: string },
  attempt: StepAttemptRecord,
  options?: { outputText?: string },
): Promise<StepAttemptRecord>;

readStepAttemptRecord(
  ref: RunRef & { stepId: string; attemptId: string },
): Promise<StepAttemptRecord | undefined>;

listStepAttemptRecords(
  ref: RunRef & { stepId: string },
): Promise<StepAttemptRecord[]>;
```

Storage layout for Plan 2:

```text
missions/sessions/<scope>/runs/<runId>/
  steps/<stepId>/
    step.json
    attempts/<attemptId>/
      attempt.json
      output.md      # optional parsed-report / unknown raw-report evidence
      result.json    # present when attempt.result is terminal
```

`attempt.json` stores `StepAttemptRecord`; when `attempt.result` exists, the same `StepResult` is also written to `result.json` for operator-friendly inspection. If implementation finds that duplicating `result` in both files creates unacceptable drift, prefer `attempt.json` as the authoritative record and make `result.json` a faithful mirror written atomically in the same method.

### Drive task step projection and D-006 source of truth

`lib/driver/durable-steps.ts` owns a small state projector over existing Drive events. It does not change event emission; it reacts after the legacy event has already been accepted.

Authoritative backend identity rules:

- `DriverRunSpec.backendName` is authoritative for Drive task `StepRecord.backend.name`, adapter `options.name`, and `RunPolicy.defaultBackend`/`RunRecord.metadata.configuredBackendName`.
- `spawn_started.backend` comes from `ctx.backend.name` in `lib/driver/run-one-task.ts` and remains legacy telemetry. Plan 2 keeps normalized `step_started.backend` mapped from this legacy event for Plan-1 compatibility.
- If `spawn_started.backend` differs from `DriverRunSpec.backendName`, do not rewrite legacy events and do not widen `KnownBackendName`. Record the observed backend string in diagnostic/evidence (`drive_backend_identity_mismatch`) and keep `StepRecord.backend.name` as the configured backend.
- Test fakes may use names such as `fake-backend` in `Backend.name`; fake names are valid only as legacy telemetry/evidence, never as persisted `BackendName` or adapter identity.

Task step rules:

- `run_started`/durable setup creates the run record if needed and records `metadata.driveTaskIds = spec.taskIds` and `metadata.configuredBackendName = spec.backendName` on initial creation. Existing run metadata is not overwritten on resume.
- `task_started` creates or updates `steps/<taskId>/step.json` with `kind: "drive"`, `backend` from `DriverRunSpec.backendName`, `dependsOn` derived from prior entries in `RunRecord.metadata.driveTaskIds`, `status: "ready"`, and input artifacts for deterministic task/prompt paths Drive can identify. If metadata is absent, derive from the active `DriverRunSpec.taskIds` slice and append a diagnostic.
- `spawn_started` starts a new attempt for that task. Attempt IDs are deterministic per step (`attempt-001`, `attempt-002`, ...), derived by listing existing attempts so resume/retry does not overwrite old evidence.
- `spawn_completed` writes the attempt result from the existing `ParsedReport`. Structured reports map to `success`, `failed`, or `partial`; `ParsedReport.outcome: "unknown"` maps to `StepResult.outcome: "unknown"` and never to success at this seam. `output.md` records parsed report evidence; for unknown reports it records `ParsedReport.raw`.
- Parsed-report file evidence maps `Report.files[].change` as `created -> added`, `modified -> modified`, and `deleted -> deleted`; current Drive reports do not emit `renamed`, so the projector must not fabricate renamed file summaries.
- Parsed-report verification evidence maps `Report.verification[].status` as `pass -> pass`, `fail -> fail`, and `not_run -> skipped` for runtime `VerificationResult.status`.
- Legacy `verify` events are a separate vocabulary: `started` records activity/evidence only; `passed -> pass`; `failed -> fail`. The projector must not look for `not_run` on a `DriverEvent` `verify` record and must not store legacy `passed`/`failed` strings in runtime `VerificationResult.status`.
- `commit_made` and successful commit finalization enrich task/finalizer results with `CommitRef` entries and commit artifacts.
- `task_done` updates the task `StepRecord.status` to `"completed"` for Drive lifecycle compatibility but never overrides an existing `unknown` result with success. If the task result is already `unknown`, keep `outcome: "unknown"`, keep `nextAction` non-`continue`, and record any later verification/commit evidence as evidence, not proof.
- `task_blocked`, failed preflight, backend failure, postflight failure, and partial outcomes persist blocked/failed/partial results with `nextAction` set to `wait_for_human` or `abort_run` according to the current Drive outcome.

D-006 is enforced in both persisted step records and actual normalized Drive events:

1. The existing `parseReport` remains the source of structured report detection.
2. The step projector maintains an in-memory latest `StepResult` by task ID before file writes, so a file-write failure does not lose result context.
3. `event-stream.ts` passes that result context to `normalizeDriverEvent` for `task_done`.
4. `durable-events.ts` uses the provided context for `step_completed.result`; if no context exists (for pure unit tests or legacy-only callers), it may fall back to the Plan-1 success result.
5. B-006 proves an actual Drive durable sink writes `unknown` to attempt, step, and normalized event records when the report is malformed, with terminal step status `completed` only because Drive emitted legacy `task_done`.

### Finalizer step projection

Finalizer steps are records of Drive’s existing finalization phases, not new execution owners.

Use deterministic IDs:

- Source commit finalizer: `finalizer-source-commit-<taskId>`
- Task status finalizer: `finalizer-task-status-<taskId>`
- Final state commit finalizer: `finalizer-state-commit`

Finalizer step fields:

- `kind: "finalizer"`
- `backend: { name: "shell-command", options: { drivePhase: <phase> } }`
- `dependsOn`: the task step for source/task-status finalizers; all original run task IDs from `RunRecord.metadata.driveTaskIds` for state commit when available, otherwise the active Drive task slice with a diagnostic
- `inputArtifacts`: relevant task step IDs, commit evidence, or `pending-finalization.json` when retrying
- `outputArtifacts`: commit refs or pending-finalization artifact refs
- `result.nextAction`: `continue` for passed/skipped, `retry` for retryable finalization failure

Finalization failure rules:

- A failed source commit, task status write, or state commit updates the relevant finalizer step to `failed` with `result.nextAction: "retry"` and a pending-finalization artifact.
- The behavioral task `StepRecord` is not converted to failed solely because finalization failed. If backend/report evidence was success, the task step may remain `completed`/success while the finalizer step fails; if report evidence was unknown, it remains unknown.
- Existing `pending-finalization.json`, `run.completion.json` outcome `finalization_failed`, and CLI resume recovery are authoritative for Drive compatibility. Step records are additional durable evidence only.
- Plan 2 leaves Plan-1 normalized finalization failure event shapes unchanged. Current `task_finalization_failed` can still normalize to a task `step_failed` compatibility event for `run_watch`; finalizer `StepRecord`s are the authoritative Plan-2 finalization model until frontend migration revisits the normalized compatibility view.
- Resume appends a new attempt for the finalizer step; it does not rewrite or delete the failed attempt. Source-commit, task-status, and state-commit resume failures require durable-only recorder calls when current code returns failure objects and writes completion JSON without emitting terminal failure events. The state-commit durable-only seam includes `acceptExternalStateCommit` rejections for `pending state task is not Done`, dirty pending task files, and unchanged `HEAD` after a `commitFinalState` `skipped/no_changes` result.

### Decision log

- Chosen: introduce `lib/durable-runtime/backends.ts` for the generic backend execution contract, while keeping persisted backend identity types in `lib/durable-runtime/types.ts`.
  - Alternative: define `BackendSpec` and backend-name types in `backends.ts` next to `OrchestrationBackend`.
  - Why: `RunPolicy` and `StepRecord` already live in `types.ts`; putting `BackendSpec` in `backends.ts` would force a runtime type import cycle or duplicate persisted contracts.
- Chosen: make `DriverRunSpec.backendName` authoritative for Drive task `StepRecord.backend`, and treat `spawn_started.backend`/`ctx.backend.name` as legacy execution telemetry.
  - Alternative: persist the observed event backend string as `StepRecord.backend.name`.
  - Why: `Backend.name` is intentionally `string` and existing tests use fake names; persisted runtime backend names are architecture-level contract values and must not widen because of test fakes. Keeping normalized `step_started.backend` as legacy telemetry preserves Plan-1 compatibility.
- Chosen: keep `unknown` as a compatibility backend name only for unconfigured generic run policy defaults.
  - Alternative: make `BackendName` a strict wave-1 union and force a fake default backend for generic run creation.
  - Why: Plan-1 `FileRunStore` already creates runs without explicit backend policy using `{ name: "unknown" }`; forcing `codex` or another real backend would lie in persisted records and break existing callers/tests.
- Chosen: wrap current Drive backends without routing Drive through a scheduler.
  - Alternative: replace `runOneTask` backend invocation with scheduler-style backend handles now.
  - Why: Plan 2 must not change invocation behavior or introduce scheduler ownership; wrapper tests prove adapter compatibility while Drive’s current loop remains behavior owner.
- Chosen: record `unknown` durable `StepResult`s even when legacy Drive later infers/accepts task completion, and use that result in actual normalized `step_completed` events.
  - Alternative: mirror legacy Drive inference into durable success results.
  - Why: `D-006` makes malformed/missing report quality a durable scheduler safety property. CLI compatibility can remain unchanged while the durable result and normalized event refuse silent step success.
- Chosen: when a malformed-report task later emits legacy `task_done`, set `StepRecord.status` to `completed` but keep `StepResult.outcome: "unknown"` and non-continue scheduler intent.
  - Alternative: mark the step `blocked` despite the legacy `task_done` event.
  - Why: Plan 2 records Drive’s current lifecycle without changing Drive behavior or normalized event shape; future scheduler logic must inspect `StepResult`, not treat `completed` status alone as proof of intended work success.
- Chosen: model Drive finalization phases as `finalizer` step records with `shell-command` backend identity while leaving Plan-1 finalization normalized events unchanged.
  - Alternative: retarget normalized finalization failure events to finalizer step IDs immediately.
  - Why: retargeting would change `run_watch` output and existing Plan-1 tests. Finalizer `StepRecord`s can carry the new recovery model now; frontend migration can later change the compatibility view deliberately.
- Chosen: preserve original Drive task order for step dependencies through `RunRecord.metadata.driveTaskIds` set on initial run creation, falling back to the active spec slice only for older/missing metadata.
  - Alternative: derive dependencies from the active `DriverRunSpec.taskIds` every time.
  - Why: `createRunSpec` rewrites resumed specs to remaining tasks; using only the active slice would erase dependencies on already-completed earlier task steps in Plan-2-created runs.
- Chosen: keep step records out of Drive CLI status/list and out of new output fields for read-only tools in Plan 2.
  - Alternative: update observation tools to synthesize status from step records.
  - Why: controller and frontend migration are later plans; Plan 2 only persists evidence and must not change current CLI behavior.

## Files to Change

- `lib/durable-runtime/types.ts` - authoritative home for `KNOWN_BACKEND_NAMES`, `KnownBackendName`, compatibility `BackendName`, `BackendSpec`, `StepKind`, `StepStatus`, extended `StepRecord`, `StepAttemptRecord`, and `RunStore` method types; keep `unknown` compatibility for generic run policy defaults.
- `lib/durable-runtime/backends.ts` - create generic `OrchestrationBackend`, `BackendCapabilities`, `BackendContext`, `PreparedStep`, and `BackendHandle` contracts; import backend-name/spec types from `types.ts` rather than redeclaring them.
- `lib/durable-runtime/file-store.ts` - add attempt directory path helpers plus `writeStepAttemptRecord`, `readStepAttemptRecord`, and `listStepAttemptRecords`; keep all paths run-owned and atomically written.
- `lib/durable-runtime/index.ts` - export the new backend and attempt contracts.
- `lib/driver/types.ts` - derive Drive’s existing `BackendName` alias from runtime `KnownBackendName` so the backend-name vocabulary has one source; keep `DriverRunSpec.backendName` as the configured Drive identity.
- `lib/driver/backends/orchestration-adapter.ts` - create the Drive `Backend` to `OrchestrationBackend<BackendInvocation, BackendRunResult>` wrapper using explicit configured `KnownBackendName` options and pinned capabilities.
- `lib/driver/durable-steps.ts` - create the Drive task/finalizer step projector, result mapping, parsed-report file/verification conversions, attempt ID allocation, configured-vs-observed backend identity handling, original task-order dependency handling, D-006 unknown handling, normalized-event result context, durable-only resume failure hooks, and diagnostic helpers.
- `lib/driver/event-stream.ts` - integrate the step projector into the existing durable sink after legacy event write/publish; persist initial run metadata for original Drive task order/configured backend; pass latest task result context into `normalizeDriverEvent` for `task_done`; add failure-isolated diagnostics for step writes.
- `lib/driver/durable-events.ts` - add optional task result context for `task_done` mapping; keep canonical terminal shapes and leave finalization failure event shapes compatible with Plan 1.
- `lib/driver/driver.ts` - keep inline sink composition compatible; update only if needed to pass step recorder context into the durable sink.
- `lib/driver/run-step.ts` - keep detached child sink composition compatible; update only if needed to pass step recorder context into the durable sink.
- `lib/driver/run-one-task.ts` - keep current preflight/backend/postflight/commit/task-status behavior; do not change legacy task outcome inference in this plan.
- `lib/driver/run-run-loop.ts` - keep current run loop and `finalization_failed` behavior; do not change legacy run outcomes in this plan.
- `lib/driver/state-commit.ts` - keep current state-commit behavior; ensure existing events remain sufficient for normal finalizer projection while CLI durable-only hooks cover resume acceptance failures with no terminal event.
- `lib/driver/README.md` - document the Plan-2 backend wrapper, authoritative backend identity rule, step/attempt layout, D-006 unknown result rule, normalized-event correction for malformed reports, finalizer-step recovery model, and finalization normalized-event compatibility exception.
- `cli/drive/subcommand.ts` - preserve status/list/resume compatibility; add durable-only finalizer attempt recording for source-commit, task-status, and state-commit resume retry failures that emit no terminal legacy event, including `acceptExternalStateCommit` rejection paths after `commitFinalState` skips with `no_changes`.
- `tests/durable-runtime/backend-contracts.test.ts` - create B-001 contract/boundary tests.
- `tests/durable-runtime/file-store.test.ts` - add B-003 attempt persistence/path-safety tests and update existing step-record fixtures for the extended `StepRecord` contract.
- `tests/driver/backends/orchestration-adapter.test.ts` - create B-002 adapter-preserves-invocation and pinned-capability tests.
- `tests/driver/durable-steps.test.ts` - create B-005 unit test for retry attempt projection.
- `tests/driver/durable-finalizers.test.ts` - create B-007 and B-008 finalizer projection/failure tests.
- `tests/driver/driver-durable-steps.test.ts` - create B-004, B-006, B-010, and B-011 Drive integration/unknown-result/failure-isolation/observation-coexistence tests, including configured-vs-observed backend identity and resumed dependency coverage.
- `tests/driver/durable-events.test.ts` - update expectations for optional D-006 task result context while keeping finalization compatibility expectations.
- `tests/cli/drive/run.test.ts` - add B-009 resume finalizer-attempt tests covering failed source-commit, failed task-status, and state-commit external-acceptance failure paths (`pending task is not Done`, dirty pending task paths, unchanged `HEAD`).

Files intentionally not changed:

- `lib/orchestration/*` - no chain migration or chain compiler.
- `domains/shared/extensions/orchestration/run-control-tools.ts` - no mutating controls and no step-record-based status synthesis in Plan 2.
- `domains/shared/extensions/orchestration/watch-events-tool.ts` - `watch_events` remains legacy Drive event observation.
- `cli/drive/subcommand.ts` status/list output semantics - only durable-only resume finalizer attempt recording may be touched; no new CLI fields.

## Risks

- **D-006 vs legacy Drive inference tension.** Current Drive can infer success from objective checks in narrow cases. Mitigation: do not change CLI behavior in this plan; persist durable `unknown` results at the step/attempt layer and in actual normalized `step_completed.result` so future scheduler/read paths will not silently continue from malformed reports. Pivot if implementation tries to change Drive task outcomes or CLI JSON to satisfy D-006.
- **`StepRecord.status: completed` plus `StepResult.outcome: unknown` could be misread.** Mitigation: B-006 pins this combination only for legacy `task_done` compatibility and requires `nextAction` to be non-`continue`; documentation and tests must make future scheduler work inspect `StepResult`, not status alone.
- **Backend identity could drift between configuration and telemetry.** Mitigation: `DriverRunSpec.backendName` is authoritative for persisted step/adaptor identity, `spawn_started.backend` stays legacy telemetry, mismatches produce diagnostics/evidence, and test fakes never widen runtime backend-name unions.
- **Adapter contract could duplicate Drive behavior.** Mitigation: the Drive wrapper receives an already-built `BackendInvocation` and calls `Backend.run` exactly once; report parsing, verification, commits, and task updates remain in existing Drive modules. Reviewer should reject duplicated parsing/commit logic in adapter code.
- **Finalizer records could weaken recovery.** Mitigation: finalizer steps are evidence records only; `pending-finalization.json`, `run.completion.json`, and current resume functions remain authoritative. B-008/B-009 prove finalization failure and resume behavior are unchanged, including source/task-status/state-commit resume failure paths with no terminal legacy event.
- **Step persistence failures could become behavior failures.** Mitigation: integrate step projection after legacy write/publish, maintain in-memory result context before file writes, swallow/report step write errors as diagnostics, and keep legacy/normalized events independent. Abort if step persistence becomes required for Drive completion.
- **Generic runtime could start depending on Drive.** Mitigation: B-001 and boundary-conformance gates inspect imports; Drive-specific projection stays in `lib/driver/durable-steps.ts`.
- **Scope creep into scheduler or graph compiler.** Mitigation: this plan records dependencies and attempts but does not evaluate readiness, acquire leases, schedule, retry, or compile Drive graphs. If implementation needs leases/heartbeats/ready queues, defer to Plan 3.
- **Step records could accidentally affect observation tools.** Mitigation: B-011 proves status/watch/list outputs do not gain step-record-derived fields until the frontend migration plan changes those surfaces. The only normalized observation change is the explicit D-006 unknown result correction for malformed report completions.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness evidence passes for targeted Plan-2 tests and the repository's configured test, lint, and typecheck checks | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for `plan:durable-backend-step-model`: every B-### has required fields, root-relative test references, and exact markers in the referenced tests after implementation | artifact evidence | hard fail after implementation creates/updates referenced tests |
| 3 | `mutation` | bindable | unbound | Targeted negative tests prove realistic faults would fail: Drive adapter mutating invocation fields or trusting fake `Backend.name` as persisted identity (B-002/B-004), unsafe attempt path traversal or overwritten attempts (B-003/B-005), malformed reports becoming success or `nextAction: continue` in step records or normalized events (B-006), finalization failure marking task behavior failed or deleting pending recovery evidence (B-008/B-009), state-commit resume acceptance failures missing retryable finalizer evidence (B-009), durable step writes changing Drive outcomes (B-010), and step records changing observation output fields (B-011) | project tests + reviewer judgment | no mutation tool is bound; degraded to targeted negative tests and reviewer reasoning |
| 4 | `boundary-conformance` | bindable | bound | `lib/durable-runtime/*` has no imports from Drive, CLI, domains, tasks, prompts, or backend implementations; `KnownBackendName`/`BackendName`/`BackendSpec` are declared in `lib/durable-runtime/types.ts` only; adapter/projection code that imports Drive lives under `lib/driver/*`; no scheduler loop, graph compiler, chain migration, worktree merge finalizer, broad parallelism, or mutating runtime control is introduced | reviewer/static inspection, optionally grep-backed | hard fail if dependency direction, type ownership, or Plan-2 scope is violated |
| 5 | `dead-code` | bindable | unbound | No stub adapters are added for future-only backend names (`package-cli`, `nested-run`, `approval`); public exports are limited to Plan-2 backend/step/attempt contracts and Drive compatibility adapters used by tests or Drive projection | lint/typecheck + reviewer judgment | unbound for conceptual dead code; reviewer must reject speculative stubs |

Project binding notes for the correctness gate: `package.json` defines this repository's checks as `test`, `lint`, and `typecheck`; in this project they are executed as `bun run test`, `bun run lint`, and `bun run typecheck`.

## Implementation Order

1. **Update durable runtime contracts first.** Write B-001 and B-003 tests, then extend `lib/durable-runtime/types.ts`, create `backends.ts`, add attempt persistence to `file-store.ts`, update `lib/driver/types.ts` to derive its Drive backend-name alias from runtime `KnownBackendName`, and update existing store tests for the extended `StepRecord` shape. Keep runtime modules Drive-free and preserve `unknown` as the unconfigured run-policy compatibility value.
2. **Add Drive backend wrappers without changing Drive execution.** Write B-002, implement `lib/driver/backends/orchestration-adapter.ts`, and prove wrapper `prepare/start` preserves the exact `BackendInvocation`, uses explicit configured backend identity, pins the three current backend capability records, and returns backend output unchanged. Do not move prompt rendering, parsing, verification, commits, or task updates into the wrapper.
3. **Add the Drive task step projector.** Write B-004 and B-005 tests, implement `lib/driver/durable-steps.ts`, and integrate it into `event-stream.ts` after legacy event write/publish. Verify a fake-backend Drive run creates task step/attempt records with `StepRecord.backend.name` from `DriverRunSpec.backendName`, records any configured-vs-observed mismatch as evidence/diagnostic, and preserves original sequential dependencies across resume via run metadata while legacy and normalized event streams remain compatible.
4. **Enforce D-006 in durable results and normalized task completion events.** Write B-006 before adding result mapping for `ParsedReport.outcome: "unknown"`. Ensure parsed-report file/verification vocabularies and legacy `verify` event vocabularies are converted separately; later `task_done` events set step status to `completed` for compatibility but cannot overwrite an unknown durable result with success, and actual normalized `step_completed.result` also stays unknown. If a proposed change alters current Drive CLI/task outcomes, stop and redesign around compatibility.
5. **Project finalization as finalizer steps while preserving normalized compatibility.** Write B-007 and B-008, then add finalizer step IDs, `shell-command` backend specs, commit/skipped result mapping, pending-finalization artifacts, and retry `nextAction` handling. Do not retarget Plan-1 finalization normalized events in this plan.
6. **Cover resume and failure isolation.** Write B-009 and B-010, then ensure resume success and failure paths append finalizer attempts, including source-commit, task-status, and state-commit `acceptExternalStateCommit` failure paths that currently emit no terminal failure event. Re-run existing Drive resume/finalization tests to confirm no output or recovery regression.
7. **Protect observation compatibility.** Write B-011 and update documentation. Verify `watch_events`, Drive status, and Drive list do not read step records or gain new fields; verify `run_watch`/`run_status` only reflect normalized events and the explicit B-006 unknown-result correction for malformed report completions.
8. **Run the Quality Contract gates.** Execute targeted tests first, then the repository correctness checks. If any task requires scheduler leases, graph compilation, chain migration, broad parallelism, worktree merge handling, or CLI output changes, stop and split that work into Plan 3/4 or a follow-up instead of expanding this plan.

## Reviewer Resolution

- `PR-001` - Resolved by updating Architecture Context, B-006, Design, Files to Change, Risks, and Implementation Order so D-006 applies to actual normalized `step_completed.result` as well as `step.json`/attempt records. The durable sink now has an explicit result-context seam: step projection records the latest task result and `normalizeDriverEvent` accepts optional task result context for `task_done`.
- `PR-002` - Resolved by updating B-009, module boundaries, finalizer projection rules, Files to Change, Risks, and Implementation Order to require durable-only hooks for source-commit and task-status resume retry failures, because current code writes completion JSON without emitting terminal failure `DriverEvent`s.
- `PR-003` - Resolved by narrowing B-004 and the storage layout: `output.md` records parsed-report evidence and unknown raw-report text available at the event seam, not unavailable full raw backend stdout for structured reports. No legacy event shape change or raw-output hook is required for this plan.
- `PR-004` - Resolved by making the finalization compatibility choice explicit: Plan 2 leaves Plan-1 normalized finalization failure event shapes unchanged, limits finalizer ownership to `StepRecord`s, and pins that with B-008/B-011 expectations. No `run_watch` finalization-output drift is introduced in Plan 2.
- `PR-005` - Resolved by replacing the strict `BackendName` proposal with `KnownBackendName` plus compatibility `BackendName = KnownBackendName | "unknown"`; `unknown` is allowed only for unconfigured generic run policy defaults and has no adapter. B-001 and the Decision Log now cover this compatibility rule.
- `PR-006` - Resolved by extending B-009, module boundaries, finalizer projection rules, Files to Change, Risks, Quality Contract, and Implementation Order to cover state-commit resume failures after `commitFinalState` returns `skipped/no_changes` and `acceptExternalStateCommit` rejects recovery. Plan 2 now requires durable-only finalizer failure hooks for source-commit, task-status, and state-commit acceptance failure paths that currently write completion JSON without terminal failure events.
- `PR-007` - Resolved by adding explicit parsed-report evidence conversions in the Drive task projection design: report verification `pass/fail/not_run` maps to runtime `pass/fail/skipped`, legacy `verify` events `started/passed/failed` are handled separately, and report file changes map `created/modified/deleted` to runtime `added/modified/deleted` without fabricating `renamed`.
- `PR-008` - Resolved by declaring `DriverRunSpec.backendName` as the authoritative configured backend identity for Drive task `StepRecord.backend`, adapter identity, run policy, and run metadata. `spawn_started.backend`/`ctx.backend.name` remains legacy telemetry and normalized `step_started.backend` compatibility data; mismatches, including test fakes like `fake-backend`, are recorded as diagnostics/evidence and never widen persisted `BackendName`.
- `PR-009` - Resolved by choosing `lib/durable-runtime/types.ts` as the sole home for `KnownBackendName`, compatibility `BackendName`, and `BackendSpec`. `lib/durable-runtime/backends.ts` imports those types and owns only execution contracts, avoiding a runtime import cycle or duplicate public type declarations.
- Missing Coverage - B-009 state-commit resume failures are now explicitly covered by `tests/cli/drive/run.test.ts` for `acceptExternalStateCommit` rejection paths: pending task not `Done`, dirty pending task paths, and unchanged `HEAD` after a `no_changes` state-commit retry.
- Missing Coverage - B-004 resume dependencies are now pinned: Plan-2-created runs persist original task order in `RunRecord.metadata.driveTaskIds`, resumed task step dependencies use that original order, and missing metadata falls back to the active spec slice with a diagnostic.
- Missing Coverage - B-006 terminal status is now pinned: malformed-report-plus-legacy-`task_done` produces `StepRecord.status: "completed"` with `StepResult.outcome: "unknown"` and no `nextAction: "continue"`.
- Missing Coverage - B-002 backend capabilities are now pinned for the three current Drive backends, with explicit `canResume`, `canCancel`, `canCommit`, `isolatedFromHostSource`, and `emitsMachineReport` values tied to current backend code and the Drive report contract.
