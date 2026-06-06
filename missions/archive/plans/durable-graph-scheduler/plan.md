---
title: 'Durable Runtime Phase 3: Graph Scheduler'
status: completed
createdAt: '2026-06-03T00:00:00.000Z'
updatedAt: '2026-06-06T14:31:22.323Z'
---

## Overview

Implement the smallest useful local durable graph scheduler on top of the real Plan-1/Plan-2 durable runtime substrate. The scheduler loads persisted run graphs, marks dependency-satisfied steps `ready`, leases and heartbeats running work, detects stale leases from persisted heartbeats, retries or blocks by explicit policy, finalizes runs from terminal step states, and supports bounded opt-in parallelism.

This plan is deliberately narrow and sequential-first. It adds the scheduler contracts missing from `lib/durable-runtime/types.ts` (`StepLease`, `StepHeartbeat`, `RetryPolicy`, `SchedulerState`, immutable/topological `RunGraph` definitions, scheduler policy fields, and optional step fields) without renaming existing fields or statuses. It does not migrate Drive or chains onto the graph scheduler; Plan 4 owns graph compilers, Drive `BackendInvocation` builders, and frontend migration.

`missions/architecture/durable-orchestration-runtime.md` remains the source of truth for this plan. If this plan and the architecture record conflict, workers must preserve the architecture record's durable-runtime boundary and record the conflict before implementation proceeds.

`missions/plans/durable-graph-scheduler/spec.md` uses Functional Requirements Seed items rather than explicit acceptance-criterion IDs. For behavior mapping, this plan normalizes the architecture record's Plan-3 acceptance and cross-plan scenarios into these acceptance references:

- `AC-001` - Graph dependency scheduling: load a persisted graph, mark steps `ready` only when `dependsOn` steps are completed, and advance runnable generic steps toward terminal state. Source: architecture Plan 3 acceptance, "scheduler advances a graph of generic steps to terminal state".
- `AC-002` - Lease lifecycle: acquire, renew, and release `StepLease` records with `holderId` ownership without adding non-canonical status members. Source: Plan 3 in-scope leases; decisions `D-007` and `D-010`.
- `AC-003` - Heartbeat and long-idle behavior: record `StepHeartbeat` while work runs and do not apply any default hard timeout when policy omits one. Source: Plan 3 heartbeat acceptance; Cross-Plan Acceptance Scenario 4.
- `AC-004` - Stale detection: a heartbeat older than `RunPolicy.staleHeartbeatMs` makes a leased running step stale from persisted state; if no stale threshold is configured, the scheduler cannot infer staleness from a fresh process. Source: Plan 3 stale machinery; Cross-Plan Acceptance Scenario 2.
- `AC-005` - Retry/block policy: `RetryPolicy.maxAttempts`, `RunPolicy.retryLimit`, and the explicit `RunPolicy.retryPotentiallyCommittedSteps` safety opt-in decide retry versus block; retries append new `StepAttemptRecord`s and never erase prior attempts; unknown, exhausted, or potentially committed ambiguous results block by default. Source: Plan 3 retry/block acceptance and architecture `D-006`/scheduler-crash bar.
- `AC-006` - Monotonic status and run finalization: step status is monotonic except explicit retry/resume transitions with a new attempt; completed work never goes back to running; run status finalizes from terminal step outcomes. Source: architecture Scheduler Model terminal-state rules.
- `AC-007` - Crash recovery without duplication: a restarted scheduler reconstructs ready queue, leases, heartbeats, step records, attempts, and scheduler records from persisted state, and never reruns completed or potentially committed work without explicit policy. Source: Cross-Plan Acceptance Scenario 2 and Plan 3 acceptance.
- `AC-008` - Restart reconciliation: a killed-and-restarted scheduler detects existing heartbeats, fresh externally-owned work, stale leases, terminal latest attempts, and terminal step records before starting work. Source: Cross-Plan Acceptance Scenario 2.
- `AC-009` - Bounded parallelism: `RunPolicy.maxParallelSteps` is explicit, defaults to sequential (`1`), is never exceeded, and does not allow parallel mutable shared-worktree execution unless backend capabilities make it safe. Source: Plan 3 acceptance; decision `D-007`.
- `AC-010` - Contract/substrate compatibility: extend existing Plan-1/Plan-2 contracts in place, use `RunStore`/`FileRunStore` primitives for all scheduler persistence, preserve canonical `RunStatus`/`StepStatus` unions, keep generic runtime modules Drive/CLI/prompt-free, and preserve real backend input contracts until Plan 4 supplies frontend-specific builders. Source: architecture Core Contracts and decisions `D-001` through `D-010`.

Non-goals for this plan: distributed scheduling, scheduler daemon/child process, per-step worktrees by default, parallel mutable work without an explicit worktree policy, chain loop migration, merge finalizer, Drive graph compiler, Drive `BackendInvocation` builder, chain graph compiler, generic `run_start`/frontend migration, and mutating controller tools.

## Architecture Context

This plan implements the third slice of
`missions/architecture/durable-orchestration-runtime.md`.

Relevant decisions:

- `D-001 - One runtime, multiple frontends`
- `D-002 - File-backed first`
- `D-004 - No default hard timeout for durable runs`
- `D-007 - First scheduler is local and sequential-first`
- `D-010 - Scheduler runs in-process for wave 1`

Boundary rules this plan must preserve:

- Scheduler logic must not assume the live interactive session remains alive.
- Hard timeout is policy, not a runtime invariant.
- Parallel mutable execution must remain constrained until worktree policy is
  explicit.
- Store, event, backend, and scheduler contracts should stay separable.
- `graph.json` is topology/static step definition only; `steps/<stepId>/step.json` is the sole authority for mutable step state during recovery.

Key record sections for the planner: `## Scheduler Model` for terminal-state,
status-monotonicity, and crash-recovery rules, and `## Cross-Plan Acceptance
Scenarios` scenarios 2 (scheduler crash) and 4 (long idle work) as the
acceptance bar.

Additional Plan-3 implications from the full decision log:

- `D-003 - Drive compatibility before chain migration`: the scheduler must build on existing `RunStore`, `StepRecord`, `StepAttemptRecord`, normalized events, and `OrchestrationBackend` contracts without replacing Drive's current loop in this plan.
- `D-005 - Normalized events with backend details`: scheduler lifecycle writes existing normalized event variants (`step_ready`, `step_started`, `step_heartbeat`, `step_completed`, `step_failed`, `step_blocked`, `step_stale`, `step_cancelled`, and terminal run events) rather than inventing a second event stream.
- `D-006 - Step results must distinguish unknown from success`: scheduler terminal decisions inspect `StepResult.outcome`/`nextAction`; malformed or non-`StepResult` backend output becomes `unknown` and blocks unless an explicit retry remains.
- `D-008 - Durable chains start narrow`: do not add chain compilers or loop migration here.
- `D-009 - Wave-1 controller surface is read-only`: do not add mutating controller tools (`run_pause`, generic `run_resume`, `run_cancel`, `run_intervene`) in this plan. `RunGraphSchedulerOptions.signal` is an invocation-local cancellation input for the in-process scheduler library, not a user-facing mutating controller.

Real substrate constraints read from the current code:

- `RunStatus` is exactly `pending | running | completed | blocked | failed | cancelled | stale`. Do not add `queued`, `waiting`, or `leased`.
- `StepStatus` is exactly `pending | ready | running | completed | blocked | failed | cancelled | stale`. Do not add `leased` or `waiting`.
- `StepRecord` currently has `id`, `runId`, `title`, `kind`, `backend`, `dependsOn`, `status`, `inputArtifacts`, `outputArtifacts`, optional `result`, and optional `latestAttemptId`. This plan extends it; it does not rename those fields.
- `RunPolicy` currently has `reportInference: "strict" | "objective"`, `defaultBackend`, `worktree`, optional `maxCostUsd`, `maxTokens`, and `timeoutMs`. This plan adds optional scheduler policy fields without changing existing meanings.
- `StepAttemptRecord` already exists as `{ attemptId, startedAt, endedAt?, result? }`; retries must append records through `RunStore.writeStepAttemptRecord` and preserve prior attempts.
- `FileRunStore` already creates `graph.json` as `{ steps, edges }`, `scheduler.json` as `{}`, step records under `steps/<id>/step.json`, and attempts under `steps/<id>/attempts/<attemptId>/`. Scheduler persistence must go through `RunStore` methods implemented by `FileRunStore`, not direct `fs` access from scheduler logic.
- `FileRunStore.writeStepAttemptRecord` persists terminal attempt evidence only when scheduler code calls it with an `endedAt`/`result`; current backend terminal output exists first as the in-memory `BackendHandle.result` promise.
- `OrchestrationBackend` already exists in `lib/durable-runtime/backends.ts` as `{ name; capabilities; prepare(step, ctx); start(prepared); resume?; cancel? }`, with `BackendCapabilities` including `canResume`, `canCancel`, `canCommit`, `isolatedFromHostSource`, and `emitsMachineReport`. Plan 3 composes this contract but does not change Drive backend invocation semantics.
- `lib/driver/backends/orchestration-adapter.ts` adapts Drive backends as `OrchestrationBackend<BackendInvocation, BackendRunResult>`. `BackendInvocation` in `lib/driver/backends/types.ts` requires `runId`, `promptPath`, `workdir`, `projectRoot`, `taskId`, `parentSessionId`, `planSlug`, and `eventSink`. Plan 3 does not register these adapters with the scheduler; Plan 4 must provide a `BackendInvocation` builder before Drive-on-graph can start them.
- Current Drive adapter capabilities are: `codex` has `canResume: false`, `canCancel: false`, `canCommit: false`, `isolatedFromHostSource: true`; `claude-cli` has `canResume: false`, `canCancel: false`, `canCommit: true`, `isolatedFromHostSource: true`; `cosmonauts-subagent` has `canResume: false`, `canCancel: false`, `canCommit: true`, `isolatedFromHostSource: false`.
- `DriveStepProjector` in `lib/driver/durable-steps.ts` is a Drive event projector, not a scheduler. Do not route scheduler state through it.
- `lib/orchestration/semaphore.ts` is useful prior art for bounded parallelism, but durable runtime code should not depend on chain/orchestration modules just to get a semaphore.

## Behaviors

### B-001 - Scheduler contracts extend canonical runtime types without status drift

- Source: AC-010 (architecture Core Contracts; Plan 3 introduces leases, heartbeats, retry policy, scheduler state, immutable graph definitions, and scheduler result contracts)
- Context: a worker imports the durable runtime public API after Plan 3
- Action: the API exposes `StepLease`, `StepHeartbeat`, `RetryPolicy`, `SchedulerState`, `RunGraphStep`, `RunGraph`, `ReadRunGraphResult`, `SchedulerStepInput`, `RunGraphSchedulerBackend`, `RunGraphSchedulerExitReason`, `RunGraphSchedulerResult`, optional `StepRecord.lease`, `StepRecord.heartbeat`, `StepRecord.retryPolicy`, and optional `RunPolicy.maxParallelSteps`, `staleHeartbeatMs`, `retryLimit`, `idleTimeoutMs`, `hardTimeoutMs`, and `retryPotentiallyCommittedSteps`
- Expected: existing `RunRecord`, `StepRecord`, `RunPolicy`, `StepAttemptRecord`, `RunStatus`, and `StepStatus` fields remain compatible; no `queued`, `waiting`, or `leased` status member is introduced; `StepLease` carries `holderId`, `acquiredAt`, optional `expiresAt`, and `renewable`; `StepHeartbeat` carries `at` and optional `note`; `RetryPolicy` carries `maxAttempts` and optional `backoffMs`; `SchedulerState` carries persisted ready step IDs, leases by step ID, heartbeats by step ID, cursor, and update timestamp; `RunGraphStep` excludes mutable fields such as `status`, `result`, `latestAttemptId`, `lease`, `heartbeat`, and `retryPolicy`; `retryPotentiallyCommittedSteps` defaults to absent/false
- Seam: `lib/durable-runtime/types.ts`; `lib/durable-runtime/index.ts`; `lib/durable-runtime/status.ts`; `lib/durable-runtime/scheduler.ts`
- Test: `tests/durable-runtime/scheduler-contracts.test.ts` > `extends scheduler contracts without renaming durable runtime fields or statuses`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-001`

### B-002 - Scheduler persistence goes through store-owned graph state heartbeat and diagnostic primitives

- Source: AC-010, AC-007 (file-backed first; crash recovery reconstructs persisted state)
- Context: a scheduler run needs to read a graph, persist ready/lease/heartbeat state, persist diagnostics, and reload it in a fresh scheduler instance
- Action: code writes graph topology, initial step records, scheduler state, step leases, heartbeats, diagnostics, and attempts through `RunStore` methods implemented by `FileRunStore`, then constructs a new `FileRunStore` and reads them back
- Expected: `graph.json`, `scheduler.json`, `steps/<stepId>/step.json`, `steps/<stepId>/heartbeat.json`, diagnostic evidence in the normalized event/diagnostic stream, and attempt directories stay inside the run directory and are written atomically where JSON records are overwritten; scheduler code has no direct `node:fs`/`fs/promises` persistence imports; persisted `SchedulerState` mirrors ready IDs, leases, heartbeats, and cursor for reconstruction; unsafe IDs/paths are rejected by the store before writing outside the run directory; diagnostics are returned to the scheduler rather than forcing it to infer from thrown filesystem errors
- Seam: `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/scheduler.ts`; `lib/fs/atomic-file.ts`
- Test: `tests/durable-runtime/scheduler-store.test.ts` > `persists graph scheduler state leases heartbeats and diagnostics through the store`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-002`

### B-003 - Dependency scheduling marks only satisfied steps ready

- Source: AC-001 (Plan 3 graph scheduling acceptance)
- Context: a persisted graph has step `build` with no dependencies, step `verify` depending on `build`, and step `publish` depending on `verify`
- Action: the scheduler reconciles ready steps before starting backend work, then completes `build` and reconciles again
- Expected: only dependency-free pending steps become `ready` initially; dependent steps remain `pending` until every `dependsOn` step is `completed`; `step_ready` events are appended exactly once per ready transition; completed steps are not put back into the ready queue
- Seam: `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/graph-scheduler.test.ts` > `marks dependency-satisfied steps ready and leaves blocked dependencies pending`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-003`

### B-004 - Lease acquisition renewal and release require the same holder

- Source: AC-002 (Plan 3 lease lifecycle acceptance)
- Context: a ready step has no active lease and scheduler holder `holder-a` attempts to run it
- Action: `holder-a` acquires the lease, renews it while the step runs, then releases it; `holder-b` attempts to renew or release the same lease during the run
- Expected: acquire persists `StepRecord.lease`, an initial heartbeat, `latestAttemptId`, a new open `StepAttemptRecord`, status `running`, and `SchedulerState.leasesByStepId`; renew updates heartbeat/lease only for the matching `holderId`; mismatched holders cannot renew or release another holder's lease; release removes the lease from the step and scheduler state without deleting the last heartbeat or attempt evidence
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/graph-scheduler.test.ts` > `acquires renews and releases step leases only for the matching holder`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-004`

### B-005 - Long idle work remains running while heartbeats stay fresh and no hard timeout is configured

- Source: AC-003 (Cross-Plan Acceptance Scenario 4; `D-004`)
- Context: a backend produces no output for longer than legacy chain timeouts, `RunPolicy.hardTimeoutMs` is absent, and the scheduler continues recording heartbeats within `staleHeartbeatMs`
- Action: the scheduler awaits the backend handle while heartbeat renewal ticks occur
- Expected: no default hard timeout or legacy chain timeout fails the step; fresh heartbeats are persisted and emit `step_heartbeat` events; the step remains `running` until the backend returns a terminal `StepResult` or heartbeats become stale by explicit policy
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-heartbeats.test.ts` > `keeps long idle running steps alive while heartbeats remain fresh and no hard timeout is configured`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-005`

### B-006 - Restart stale detection uses persisted heartbeat age not empty memory defaults

- Source: AC-004, AC-008 (Cross-Plan Acceptance Scenario 2)
- Context: a prior scheduler process died after persisting a running step lease and heartbeat; the restarted scheduler starts with an empty in-memory lease/heartbeat map and `RunPolicy.staleHeartbeatMs` is configured
- Action: the restarted scheduler loads the persisted step record, scheduler state, heartbeat record, and attempts, compares `StepHeartbeat.at` to `RunPolicy.staleHeartbeatMs`, and reconciles the step
- Expected: if the persisted heartbeat is older than `staleHeartbeatMs`, the step is classified stale from persisted evidence, `step_stale` is appended when the normal stale transition is safe, the old lease is released only as part of a persisted stale/block transition, and no fresh heartbeat/default lease is fabricated from empty memory; canCommit safety blocking in B-014 takes precedence over stale retry for potentially committed non-resumable work
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `marks a running leased step stale from persisted heartbeat age after restart`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-006`

### B-007 - Retry appends a new attempt and preserves prior evidence

- Source: AC-005, AC-006 (Plan 3 retry acceptance; monotonic attempt records)
- Context: a step attempt ends with `StepResult.nextAction: "retry"`, the effective `RetryPolicy.maxAttempts` allows another attempt, the step is not in the potentially committed ambiguous window from B-014, and prior attempt evidence exists on disk
- Action: the scheduler releases the failed/stale attempt, requeues the step by explicit retry transition, starts the retry, and receives a terminal success
- Expected: the first `attempt-001` remains readable with its result/output evidence; the retry creates `attempt-002` rather than overwriting `attempt-001`; `StepRecord.latestAttemptId` points to `attempt-002`; status transitions that move back to `ready`/`running` are allowed only because a new attempt is appended; completed steps are never retried
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-retry.test.ts` > `retries with a new attempt record and preserves prior failed attempt evidence`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-007`

### B-008 - Unknown results and exhausted retries block instead of advancing dependents

- Source: AC-005 (retry/block transitions; architecture `D-006`)
- Context: a backend returns malformed output, an object that is not a valid `StepResult`, `StepResult.outcome: "unknown"`, or a retryable failure after the effective max attempts are exhausted
- Action: the scheduler normalizes the backend result and applies the terminal transition
- Expected: unknown or exhausted retry outcomes persist a blocked `StepResult`, set the step to `blocked`, append `step_blocked`, do not mark dependent steps `ready`, and finalize the run as `blocked` when no other runnable work can change the outcome
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/backends.ts`; `lib/durable-runtime/status.ts`
- Test: `tests/durable-runtime/scheduler-retry.test.ts` > `blocks unknown results and exhausted retries instead of advancing dependents`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-008`

### B-009 - Crash recovery never reruns completed committed work

- Source: AC-007 (Cross-Plan Acceptance Scenario 2; critical no-duplication bar)
- Context: a scheduler completed a step, persisted its terminal `StepRecord.result`, output artifacts or commits, and attempt result, then crashed before a new scheduler process started
- Action: the restarted scheduler begins with empty in-memory ready queue, lease map, heartbeat map, and active handle map, then reconciles the persisted run
- Expected: the completed step is never acquired, prepared, started, resumed, or assigned a new attempt; dependents may become ready from the persisted completed state; committed/output evidence remains untouched; a fake backend call counter proves no duplicate committed work was run
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `does not rerun completed steps when restarted with empty in-memory state`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-009`

### B-010 - Recovery reconstructs ready queue leases and heartbeats from persisted records

- Source: AC-007, AC-008 (Cross-Plan Acceptance Scenario 2; persisted-state reconstruction bar)
- Context: `scheduler.json` contains a ready set and lease/heartbeat snapshots, step records contain current statuses and lease/heartbeat fields, and a new scheduler instance has no in-memory scheduler state
- Action: the scheduler rebuilds its runnable queue and active/stale lease view from persisted graph topology, step records, attempts, heartbeat files, and scheduler records
- Expected: ready steps are recomputed from persisted dependencies and `step.json` terminal state, not from an empty default queue or graph-embedded mutable fields; leases and heartbeats are reconstructed from persisted records, with terminal step records overriding stale scheduler snapshots; inconsistent persisted records produce diagnostics/blocking rather than silent duplicate execution
- Seam: `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `reconstructs ready queue leases and heartbeats from persisted records after restart`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-010`

### B-011 - Recovery commits terminal latest attempts before considering a rerun

- Source: AC-008, AC-006 (Cross-Plan Acceptance Scenario 2; terminal process state)
- Context: a scheduler crashed after writing `attempt-001` with `endedAt` and terminal `result`, but before updating `steps/<stepId>/step.json` from `running`
- Action: the restarted scheduler reads `StepRecord.latestAttemptId`, loads that attempt, and reconciles the step before selecting ready work
- Expected: the scheduler promotes the step to `completed`, `blocked`, or `failed` from the persisted latest attempt result, releases any old lease, appends the matching terminal event if missing, and does not call `backend.start` for a duplicate attempt
- Seam: `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `promotes terminal attempt results on restart without starting a duplicate backend`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-011`

### B-012 - Bounded parallelism defaults to one and never exceeds explicit maxParallelSteps

- Source: AC-009 (Plan 3 bounded parallelism acceptance; `D-007`)
- Context: a graph has several independent ready steps and fake backend handles that remain pending until the test releases them
- Action: the scheduler runs once with no `RunPolicy.maxParallelSteps`, then with `maxParallelSteps: 2`
- Expected: the default run starts only one step at a time; the explicit run starts no more than two concurrent safe steps; observed active backend count never exceeds the effective limit; shared-worktree mutable safety constraints in B-016 can lower the effective limit below `maxParallelSteps`
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/types.ts`
- Test: `tests/durable-runtime/scheduler-parallelism.test.ts` > `defaults to one running step and never exceeds explicit maxParallelSteps`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-012`

### B-013 - Run finalization follows terminal step outcomes monotonically

- Source: AC-006 (architecture Scheduler Model terminal-state rules; Plan 3 acceptance)
- Context: all graph steps have reached terminal statuses, or at least one step is blocked/failed/stale with no retryable work left
- Action: the scheduler evaluates terminal run state after each persisted step transition
- Expected: all completed steps produce `run_completed` and `RunStatus.completed`; any blocked step with no runnable work produces `run_blocked`; unrecoverable failed/cancelled/stale states produce the corresponding terminal run event/status; `FileRunStore.updateRun` terminal monotonicity is respected and no terminal run is demoted to `running`
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/status.ts`; `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/controller.ts`
- Test: `tests/durable-runtime/graph-scheduler.test.ts` > `finalizes run from terminal step outcomes without nonterminal demotion`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-013`

### B-014 - Potentially committed running work blocks instead of retrying after the terminal-evidence crash window

- Source: AC-005, AC-007, AC-008 (retry/block policy; scheduler crash without duplicating committed work)
- Context: a prior scheduler wrote an open attempt and started a backend whose capabilities are `canCommit: true` and `canResume: false`; the backend performed an externally visible commit-like side effect before `BackendHandle.result` settled and before the scheduler could write a terminal `StepAttemptRecord`; the process then died, leaving a nonterminal `running` step with persisted lease/heartbeat but no persisted `endedAt`/`result`
- Action: a restarted scheduler with empty in-memory state reconciles the stale running step while `RunPolicy.retryPotentiallyCommittedSteps` is absent or false
- Expected: the scheduler does not call `backend.prepare`, `backend.start`, or create a new attempt for that step; the fake commit side-effect counter remains `1`; the open attempt and heartbeat evidence remain readable; the step/run block with a diagnostic such as `potentially_committed_without_terminal_evidence` explaining that retrying may duplicate committed work; normal stale retry is allowed only when the backend is non-committing/idempotent (`canCommit: false`) or policy explicitly sets `retryPotentiallyCommittedSteps: true`
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/backends.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `blocks potentially committed running work without terminal attempt evidence after restart`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-014`

### B-015 - Fresh externally-owned non-resumable running work is not duplicated after restart

- Source: AC-004, AC-008 (fresh heartbeat recovery; current Drive adapters are non-resumable)
- Context: a restarted scheduler finds a persisted `running` step with a lease, an open latest attempt, and a fresh persisted heartbeat; the registered backend has `canResume: false`; the new scheduler process has no active in-memory handle
- Action: the scheduler reconciles once with `RunPolicy.staleHeartbeatMs` greater than the heartbeat age, and again in a setup where `staleHeartbeatMs` is absent
- Expected: both setups make zero `backend.prepare`/`backend.start` calls, create no new attempt, and fabricate no in-memory lease or heartbeat; the step remains `running` with its original persisted lease/heartbeat; the scheduler returns `exitReason: "waiting_for_fresh_external_work"` with a diagnostic such as `externally_owned_fresh_running_work`; when `staleHeartbeatMs` is absent, staleness cannot be decided, so the scheduler leaves the step running and returns without starting or duplicating it
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `leaves fresh nonresumable running work externally owned without starting a duplicate after restart`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-015`

### B-016 - Shared-worktree mutable concurrency is capped while safe isolated backends may run in parallel

- Source: AC-009, AC-010 (bounded parallelism; architecture boundary forbids parallel mutable shared-worktree execution)
- Context: two independent ready steps are available, `RunPolicy.maxParallelSteps` is `2`, and `RunPolicy.worktree.mode` is `shared`
- Action: the scheduler first runs them with registered fake backends whose capabilities include `canCommit: true` and are not explicitly safe for shared concurrent mutation, then runs the same graph with fake backends whose capabilities are `isolatedFromHostSource: true` and `canCommit: false`
- Expected: in the mutable shared-worktree case, effective concurrency is capped to `1` and the scheduler returns/appends a clear policy diagnostic such as `shared_worktree_mutable_concurrency_capped` instead of running both committing steps at once; in the isolated non-committing case, both independent steps may run concurrently and observed active count can reach `2` but never exceed it
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/backends.ts`
- Test: `tests/durable-runtime/scheduler-parallelism.test.ts` > `caps shared-worktree committing backends to sequential while isolated non-committing backends run in parallel`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-016`

### B-017 - Step records are the sole authority for mutable state when graph definitions conflict

- Source: AC-007, AC-010 (recovery state authority; contract/substrate compatibility)
- Context: `graph.json` contains a legacy or malformed step object with extra mutable fields such as `status`, `result`, `latestAttemptId`, `lease`, `heartbeat`, or `retryPolicy`, while `steps/<stepId>/step.json` contains different mutable values for the same step
- Action: a restarted scheduler reads the graph and step record, then reconciles before selecting work
- Expected: the scheduler ignores the graph-embedded mutable fields, records diagnostics such as `ignored_graph_mutable_state`, and uses only `step.json` plus attempt/heartbeat records to decide status, latest attempt, lease, heartbeat, result, and retry policy; a graph claiming terminal or running state cannot cause a duplicate start or suppress a `step.json` terminal/blocking state
- Seam: `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `uses step records as mutable authority when graph step fields conflict`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-017`

### B-018 - Missing or corrupt step records for graph steps block before execution

- Source: AC-007, AC-010 (recovery state authority; store/scheduler compatibility)
- Context: `graph.json` includes a static graph step ID but `steps/<stepId>/step.json` is missing or invalid JSON when the scheduler starts
- Action: the scheduler reconciles the graph before acquiring any lease or starting any backend
- Expected: the scheduler does not default the graph step to `pending`, `ready`, or `running`; it makes zero backend calls, preserves existing files without overwriting corrupt evidence, persists/returns a diagnostic such as `missing_step_record` or `corrupt_step_record`, and blocks the run before execution because mutable step state is unavailable
- Seam: `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/scheduler.ts`
- Test: `tests/durable-runtime/scheduler-recovery.test.ts` > `blocks graph steps with missing or corrupt step records before execution`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-018`

### B-019 - Scheduler signal cancellation records evidence or preserves externally-owned work safely

- Source: AC-006, AC-010 (terminal status/finalization and scheduler public contract compatibility)
- Context: `runDurableGraphScheduler` is running an active scheduler-owned step with an open attempt, lease, heartbeat, and a backend handle; the caller's `RunGraphSchedulerOptions.signal` is aborted
- Action: the scheduler observes the abort signal while the backend is still pending
- Expected: for a backend with `capabilities.canCancel: true` and a `cancel` method, the scheduler calls `cancel` once, writes a terminal attempt result with `outcome: "cancelled"`, releases the lease, sets the step and run to `cancelled` when no other work remains, appends `step_cancelled`/`run_cancelled`, and returns `exitReason: "cancelled"`; for a backend that cannot confirm cancellation, the scheduler does not fabricate terminal success/failure or release the lease, preserves the open attempt and heartbeat as externally-owned running evidence, returns a diagnostic such as `cancellation_not_supported`, and does not start a replacement attempt
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/scheduler-state.ts`; `lib/durable-runtime/file-store.ts`; `lib/durable-runtime/backends.ts`
- Test: `tests/durable-runtime/scheduler-cancellation.test.ts` > `cancels active backend on signal and preserves running evidence when cancellation is unsupported`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-019`

### B-020 - Scheduler backend registration cannot erase Drive invocation contracts

- Source: AC-010 (contract/substrate compatibility; real Drive adapters require `BackendInvocation`)
- Context: Plan 3 scheduler code receives a backend registry, and a worker attempts to register `createDriveBackendOrchestrationAdapter`, which is `OrchestrationBackend<BackendInvocation, BackendRunResult>` and requires Drive-specific invocation fields
- Action: the scheduler contract test assigns the Drive adapter to a `RunGraphSchedulerBackend` registry using a TypeScript `@ts-expect-error` guard, and inspects scheduler sources for Drive backend imports
- Expected: the Drive adapter is not assignable to the Plan-3 scheduler backend type because Plan 3 accepts only generic `SchedulerStepInput`-to-`StepResult` scheduler backends; scheduler code cannot start a Drive adapter with `unknown` or missing `BackendInvocation` fields; Drive adapter registration is deferred to Plan 4, where a `BackendInvocation` builder must provide `runId`, `promptPath`, `workdir`, `projectRoot`, `taskId`, `parentSessionId`, `planSlug`, and `eventSink`
- Seam: `lib/durable-runtime/scheduler.ts`; `lib/durable-runtime/types.ts`; `lib/durable-runtime/backends.ts`; `lib/driver/backends/orchestration-adapter.ts`; `lib/driver/backends/types.ts`
- Test: `tests/durable-runtime/scheduler-contracts.test.ts` > `does not accept Drive orchestration adapters without a Plan 4 BackendInvocation builder`
- Marker: `@cosmo-behavior plan:durable-graph-scheduler#B-020`

## Design

### Module boundaries

- `lib/durable-runtime/types.ts` (existing): extend the persisted contract names in place. Add `StepLease`, `StepHeartbeat`, `RetryPolicy`, `SchedulerState`, `RunGraphStep`, `RunGraph`, `ReadRunGraphResult`, `SchedulerStepInput`, `RunGraphSchedulerExitReason`, `RunGraphSchedulerResult`, optional `StepRecord.lease`, `StepRecord.heartbeat`, optional `StepRecord.retryPolicy`, and optional `RunPolicy.maxParallelSteps`, `staleHeartbeatMs`, `retryLimit`, `idleTimeoutMs`, `hardTimeoutMs`, and `retryPotentiallyCommittedSteps`. Preserve existing `reportInference`, `defaultBackend`, `worktree`, `timeoutMs`, `StepAttemptRecord`, `StepRecord` field names, and the actual `RunStatus`/`StepStatus` unions.
- `lib/durable-runtime/status.ts` (existing): keep run-status helpers and add step-status helpers such as `isTerminalStepStatus` and scheduler transition helpers if needed. Do not add new status literals.
- `lib/durable-runtime/file-store.ts` (existing): extend `RunStore`/`FileRunStore` with store-owned graph, scheduler-state, heartbeat, diagnostic, and step-list methods. The scheduler calls these methods only; it never reads or writes `record.graphPath`, `record.schedulerStatePath`, heartbeat files, or attempt files directly. Continue using `writeFileAtomically` for JSON writes and the existing safe identifier/path checks.
- `lib/durable-runtime/scheduler-state.ts` (new): pure state/reconciliation module. Owns dependency readiness, graph-vs-step validation, persisted-state merge, stale classification, fresh external-work classification, canCommit safety classification, retry eligibility, shared-worktree concurrency classification, cancellation transition decisions, and terminal run decision helpers. It imports durable-runtime types only and has no filesystem, backend, timer, Drive, CLI, domains, prompt, task, or orchestration imports.
- `lib/durable-runtime/scheduler.ts` (new): in-process scheduler library. Owns `runDurableGraphScheduler` (or equivalent public scheduler entry point), lease lifecycle orchestration, backend `prepare`/`start`/`resume` composition for scheduler-typed generic backends, heartbeat timers, bounded concurrency, signal handling, result normalization, event appends, diagnostics, and store writes. It depends on `RunStore`, durable-runtime types, and `OrchestrationBackend` only.
- `lib/durable-runtime/index.ts` (existing): re-export scheduler contracts and entry points.
- `lib/durable-runtime/backends.ts` (existing): no shape change required for Plan 3 unless TypeScript generics need a scheduler-facing alias. Scheduler accepts only `RunGraphSchedulerBackend` adapters and normalizes backend results to `StepResult`; malformed/non-`StepResult` output becomes `StepResult.outcome: "unknown"` rather than trusted success.
- `lib/orchestration/semaphore.ts` (existing): prior art only. Do not import this from durable runtime if doing so would make the generic runtime depend on the orchestration/chain layer. Implement a tiny scheduler-local limiter if needed.
- `lib/driver/durable-steps.ts`, `lib/driver/backends/orchestration-adapter.ts`, `lib/driver/run-step.ts`, and `lib/driver/run-run-loop.ts` (existing): read as Plan-1/Plan-2 substrate but not scheduler ownership seams in this plan. Drive continues to use its current loop until Plan 4.

### Public contracts to add

Contract names are dictated by the architecture record and current code. Use these shapes unless implementation discovers a TypeScript-only compatibility detail that requires an additive optional field:

```ts
export interface StepLease {
  holderId: string;
  acquiredAt: string;
  expiresAt?: string;
  renewable: boolean;
}

export interface StepHeartbeat {
  at: string;
  note?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs?: number;
}

export interface SchedulerState {
  readyStepIds: string[];
  leasesByStepId: Record<string, StepLease>;
  heartbeatsByStepId: Record<string, StepHeartbeat>;
  cursor?: number;
  updatedAt: string;
}

export interface RunGraphStep {
  id: string;
  runId: string;
  title: string;
  kind: StepKind;
  backend: BackendSpec;
  dependsOn: string[];
  inputArtifacts: ArtifactRef[];
}

export interface RunGraph {
  steps: RunGraphStep[];
  edges: Array<{ from: string; to: string }>;
}

export interface ReadRunGraphResult {
  graph: RunGraph;
  diagnostics: RuntimeDiagnostic[];
}

export interface SchedulerStepInput {
  runId: string;
  stepId: string;
  inputArtifacts: ArtifactRef[];
  backendOptions?: Record<string, unknown>;
}

export type RunGraphSchedulerBackend = OrchestrationBackend<
  SchedulerStepInput,
  StepResult
>;

export type RunGraphSchedulerExitReason =
  | "terminal"
  | "drained"
  | "blocked"
  | "cancelled"
  | "waiting_for_fresh_external_work";
```

`RunGraph` is immutable/topological. It carries step identity, static execution metadata, and dependency topology only. It must not be used as a persisted source for mutable scheduler state. If a stored graph file contains legacy or malformed step objects with `status`, `result`, `latestAttemptId`, `lease`, `heartbeat`, `retryPolicy`, `outputArtifacts`, or other mutable `StepRecord`-like fields, `readRunGraph` must ignore those fields for recovery decisions and return diagnostics; workers must not copy those fields into `StepRecord` during recovery.

Extend existing records additively:

```ts
export interface StepRecord {
  // existing fields stay unchanged
  lease?: StepLease;
  heartbeat?: StepHeartbeat;
  retryPolicy?: RetryPolicy;
}

export interface RunPolicy {
  // existing fields stay unchanged
  maxParallelSteps?: number;
  staleHeartbeatMs?: number;
  retryLimit?: number;
  idleTimeoutMs?: number;
  hardTimeoutMs?: number;
  retryPotentiallyCommittedSteps?: boolean;
}
```

`retryPotentiallyCommittedSteps` defaults to absent/false. Setting it to true is an explicit, unsafe policy opt-in that allows normal stale retry policy to run even when a prior attempt may have committed side effects without terminal evidence. The scheduler must mention this risk in diagnostics/events when the opt-in is used.

`StepRecord.worktree` is not required for Plan 3 behavior. If implementation needs it only to express the architecture's future target, it must be optional, inert, and must not create per-step worktrees or merge behavior in this plan. Existing `RunPolicy.worktree` remains the wave-1 concurrency guard.

Add store-owned primitives to `RunStore` so the scheduler does not bypass persistence boundaries:

```ts
readRunGraph(ref: RunRef): Promise<ReadRunGraphResult>;
writeRunGraph(ref: RunRef, graph: RunGraph): Promise<RunGraph>;
readSchedulerState(ref: RunRef): Promise<SchedulerState>;
writeSchedulerState(ref: RunRef, state: SchedulerState): Promise<SchedulerState>;
writeStepHeartbeat(ref: RunRef & { stepId: string }, heartbeat: StepHeartbeat): Promise<StepHeartbeat>;
readStepHeartbeat(ref: RunRef & { stepId: string }): Promise<StepHeartbeat | undefined>;
listStepRecords(ref: RunRef): Promise<StepRecord[]>;
appendDiagnostic(ref: RunRef, diagnostic: RuntimeDiagnostic): Promise<void>;
```

`readSchedulerState` should normalize the Plan-1 `{}` scaffold into an empty persisted state (`readyStepIds: []`, empty maps, `updatedAt` from now or run record) only at the store boundary. Scheduler recovery must still read persisted records; it must not treat an empty in-memory map as proof that no lease/heartbeat exists.

### Scheduler composition

The public scheduler entry point should be an in-process library, not a daemon:

```ts
export interface RunGraphSchedulerOptions {
  store: RunStore;
  ref: RunRef;
  backends: ReadonlyMap<KnownBackendName, RunGraphSchedulerBackend>;
  holderId: string;
  inputForStep?: (
    step: StepRecord,
    run: RunRecord,
  ) => SchedulerStepInput | Promise<SchedulerStepInput>;
  now?: () => string;
  signal?: AbortSignal;
  heartbeatIntervalMs?: number;
}

export interface RunGraphSchedulerResult {
  run: RunRecord;
  steps: StepRecord[];
  diagnostics: RuntimeDiagnostic[];
  exitReason: RunGraphSchedulerExitReason;
}
```

`runDurableGraphScheduler(options)` drains until the run is terminal, blocked by policy/safety, cancelled by `signal`, or has only fresh externally-owned running work that cannot be resumed by available backends. If implementation needs a single-tick function for tests, expose it from the same module with a clearly scheduler-scoped name and keep the drain loop as the production entry point.

Backend lookup rules:

- Use `step.backend.name` when it is a `KnownBackendName` and a registered scheduler backend exists.
- If the backend name is `unknown` or no adapter is registered, write a blocked `StepResult` and `step_blocked`; do not fabricate success or skip the step.
- `RunGraphSchedulerBackend` returns `StepResult`. Scheduler accepts a valid `StepResult` directly; any malformed/non-`StepResult` output becomes `StepResult.outcome: "unknown"` with `nextAction: "wait_for_human"`, then blocks per `D-006` unless explicit retry policy remains.
- `OrchestrationBackend.resume` is used only for a persisted running step with a fresh heartbeat/lease and a backend that declares/resolves resume support. If resume is unavailable, do not start a duplicate attempt while the persisted heartbeat is fresh; return `waiting_for_fresh_external_work` with diagnostics.

### Backend input boundary and Plan-4 Drive handoff

Plan 3 scheduler backends are generic scheduler backends that accept `SchedulerStepInput` and return `StepResult`. They are expected to be fake/test backends or future generic runtime adapters that already speak the scheduler result contract.

Real Drive adapters are **not** registered with the Plan-3 scheduler. `createDriveBackendOrchestrationAdapter` returns `OrchestrationBackend<BackendInvocation, BackendRunResult>`, and its `start` method passes `prepared.input` directly to `backend.run(prepared.input)`. `BackendInvocation` requires `runId`, `promptPath`, `workdir`, `projectRoot`, `taskId`, `parentSessionId`, `planSlug`, and `eventSink`; none of those can be safely invented by the generic scheduler. Plan 4 must add a Drive graph compiler and `BackendInvocation` builder before routing Drive steps through the graph scheduler.

The B-020 contract test must fail if a Drive adapter can be assigned to the Plan-3 `RunGraphSchedulerBackend` registry or if `lib/durable-runtime/scheduler.ts` imports `lib/driver/backends/*`. This prevents the previous unsafe `OrchestrationBackend<unknown, unknown>` erasure boundary.

### Status and attempt transition rules

Use the current status vocabulary only:

- Initial graph steps are `pending` or `ready`; no `queued` status exists.
- Readiness transition: `pending -> ready` when all `dependsOn` steps are `completed`.
- Lease/start transition: `ready -> running` with `StepRecord.lease`, initial `StepHeartbeat`, new `StepAttemptRecord`, `latestAttemptId`, `step_started`, and mirrored `SchedulerState` updates. There is no `leased` status.
- Heartbeat transition: `running` remains `running`; update `StepRecord.heartbeat`, `steps/<id>/heartbeat.json`, `SchedulerState.heartbeatsByStepId`, and append `step_heartbeat`.
- Terminal transition: `running -> completed|blocked|failed|cancelled|stale` based on `StepResult`, cancellation, stale detection, or canCommit safety blocking. Release the lease only when the scheduler has durably recorded a terminal or blocked transition; preserve heartbeat and attempt evidence.
- Potentially committed safety transition: a stale/nonterminal running step with no terminal latest attempt result, `canCommit: true`, and no safe resume path transitions to `blocked` with diagnostic unless `retryPotentiallyCommittedSteps: true` is explicitly configured. It must not transition directly to retry.
- Retry transition: `failed|stale|blocked -> ready|running` is allowed only when the previous attempt has a terminal result requiring retry, the effective max attempts allow another attempt, and the step is not in the potentially committed ambiguous window unless policy opted in. The next run must append a new `StepAttemptRecord`; it must not rewrite the old attempt.
- Signal cancellation transition: confirmed backend cancellation writes a terminal cancelled attempt/result and releases the lease. Unsupported or unconfirmed cancellation preserves the lease/heartbeat/open attempt and returns diagnostics instead of fabricating terminal state.
- Completed work is terminal for scheduler purposes. `completed -> running` is never valid.
- Run terminal transitions must respect `FileRunStore.updateRun` terminal monotonicity. Once a run is terminal, the scheduler cannot demote it to `running`.

Effective attempts:

- Prefer `step.retryPolicy?.maxAttempts` when present.
- Otherwise derive a default from `run.policy.retryLimit` if present. Treat `retryLimit` as retries after the first attempt, so effective max attempts is `retryLimit + 1`.
- Otherwise default to `1` attempt. No retry happens by default.
- `RetryPolicy.backoffMs` may be represented in state or respected with a small delay, but broad delayed scheduling is not required. If backoff adds complexity, store it and defer timed wakeups; do not expand into a daemon scheduler.

Result classification:

- `outcome: "success"` with no contrary `nextAction` -> `completed`, `step_completed`.
- `outcome: "cancelled"` -> `cancelled`, `step_cancelled`.
- `nextAction: "retry"` and attempts remain -> explicit retry transition; no dependent step advances until a later success.
- `outcome: "unknown"` -> `blocked` unless a retry remains; never `completed`.
- Retry exhausted -> `blocked`, not repeated `failed` loops.
- `nextAction: "abort_run"` or unrecoverable backend error -> `failed`/`run_failed`.
- `outcome: "blocked"`, `"partial"`, or `nextAction: "wait_for_human"` -> `blocked`.

### Crash recovery algorithm

Crash recovery is the load-bearing behavior. The scheduler must not depend on in-memory maps surviving process death.

On every scheduler start or resume:

1. Load the run with `store.loadRun(ref)`. If the run is terminal, return without starting work.
2. Load the graph with `store.readRunGraph(ref)`, persisted step records with `store.listStepRecords(ref)` and/or per-graph-step `readStepRecord`, and scheduler state with `store.readSchedulerState(ref)`. Include graph/store diagnostics in `RunGraphSchedulerResult.diagnostics` and persist them when they affect execution.
3. Treat `graph.json` as topology/static definition only. Merge by graph step ID, but use `steps/<stepId>/step.json` as the sole authority for `status`, `result`, `latestAttemptId`, `lease`, `heartbeat`, `retryPolicy`, and output evidence. Mutable fields embedded in graph step objects are ignored and diagnosed.
4. A graph step missing a valid `step.json` is an inconsistent persisted run. Diagnose and block before execution; do not create a default runnable `StepRecord` from graph topology.
5. For each step with `latestAttemptId`, load the latest attempt. If that attempt has `endedAt` and `result` while the step is still nonterminal, apply the terminal transition from that attempt before considering any backend start. This handles a crash after attempt result write but before step update.
6. For terminal steps, trust the persisted terminal step record and never enqueue or start them. Terminal step records override stale scheduler snapshots and graph-embedded mutable fields.
7. For nonterminal running steps, reconstruct lease/heartbeat from `StepRecord.lease`, `StepRecord.heartbeat`, `steps/<id>/heartbeat.json`, and `SchedulerState`. If no persisted lease/heartbeat can be found for a running Plan-3-owned step, treat the state as inconsistent and block/diagnose rather than inventing an empty lease map and rerunning work.
8. If a running step's heartbeat is fresh, or if `RunPolicy.staleHeartbeatMs` is absent so staleness cannot be decided, and the scheduler has no in-memory handle, return `waiting_for_fresh_external_work`. If the backend safely supports `resume`, resume the existing attempt/handle. If resume is unavailable, do not start a duplicate attempt.
9. If a running step's heartbeat is older than configured `staleHeartbeatMs`, first check for persisted terminal latest-attempt evidence. If none exists and the backend has `capabilities.canCommit === true` and no safe resume path, block/diagnose `potentially_committed_without_terminal_evidence` unless `run.policy.retryPotentiallyCommittedSteps === true`.
10. Only after the canCommit safety check may stale detection release the old lease, append `step_stale`, and let retry/block policy decide the next transition. Pure idempotent/non-committing backends (`canCommit === false`) may be retried after stale detection when retry policy allows it.
11. Recompute the ready queue from persisted `step.json` statuses and dependencies; use `SchedulerState.readyStepIds` only as a persisted snapshot for deterministic ordering, not as the sole source of truth.
12. Persist the reconstructed `SchedulerState` before starting new backend work.

This explicitly forbids the bug class where a restarted scheduler begins with empty in-memory ready/lease/heartbeat maps and fabricates defaults instead of reading persistence.

### Bounded parallelism and worktree guard

`RunPolicy.maxParallelSteps` defaults to `1`. Values less than `1` are invalid and should block the run or throw a configuration error before starting work. Values greater than `1` are opt-in.

Use a scheduler-local limiter with FIFO behavior similar to `lib/orchestration/semaphore.ts`. The limiter tracks active backend handles and ensures `active <= effectiveMaxParallelSteps` at all times.

Parallel mutable work remains constrained and testable:

- If `run.policy.worktree.mode === "shared"`, concurrent starts are allowed only for backends that are explicitly safe for shared concurrent execution in wave 1: `capabilities.isolatedFromHostSource === true && capabilities.canCommit === false`. Otherwise the scheduler must cap effective concurrency to `1` and return/persist a clear policy diagnostic, or block the run with a clear policy diagnostic. B-016 chooses the cap-to-1 behavior.
- If `run.policy.worktree.mode === "isolated"`, the scheduler may honor `maxParallelSteps` but must not create, merge, or clean up per-step worktrees in this plan.
- Do not introduce new worktree modes or merge finalizers here.

### Event and store write order

Use event ordering that is recoverable if the process dies between writes:

1. For ready transitions, write `StepRecord.status: "ready"`, update `SchedulerState.readyStepIds`, then append `step_ready`. On recovery, a missing event can be appended idempotently or left as state evidence; do not rerun solely to recreate an event.
2. For attempt start, write the open `StepAttemptRecord` before calling the backend, update `StepRecord.latestAttemptId/status/lease/heartbeat`, update `SchedulerState`, then append `step_started`.
3. During running work, heartbeat writes are independent and repeatable: update heartbeat file/step/scheduler state and append `step_heartbeat`.
4. A backend may perform externally visible work before its `BackendHandle.result` promise settles. Existing Drive adapters expose terminal output only through that in-memory promise, so a scheduler crash can occur after committed side effects but before any terminal attempt/result write.
5. On terminal result that reaches the scheduler, write the terminal attempt result first, then update the step terminal status/result and release lease, then append terminal step event, then evaluate run terminal status.
6. If a crash occurs after attempt result but before step terminal update, B-011 recovery promotes from the attempt before any backend start.
7. If a crash occurs after backend committed work but before terminal attempt evidence is written, recovery sees only a running step/open attempt. For `canCommit: true` and non-resumable backends, B-014 requires a safety block/diagnostic instead of automatic retry. For `canCommit: false` backends, stale recovery may retry by policy because there is no committed external work to duplicate.
8. For signal cancellation, write cancellation attempt evidence only after cancellation is confirmed by the backend contract. If cancellation cannot be confirmed, preserve lease/heartbeat/open-attempt evidence and return diagnostics without terminal demotion or duplicate start.

### Decision log

- Chosen: build a small in-process `lib/durable-runtime/scheduler.ts` plus pure `scheduler-state.ts` instead of a daemon or child process.
  - Alternative: start with a long-running supervisor process.
  - Why: `D-010` keeps wave-1 scheduler form in-process; tests can prove durable recovery without adding process management.
- Chosen: represent leases as `StepRecord.lease`/`SchedulerState.leasesByStepId` while keeping `StepStatus` as `running`; do not add a `leased` status.
  - Alternative: add `StepStatus: "leased"` to mirror the architecture target draft.
  - Why: current Plan-1/Plan-2 code already fixed the canonical status union without `leased`; the architecture record says extend existing fields, never rename or drift status vocabulary.
- Chosen: make `graph.json` immutable/topological (`RunGraphStep[]`) and `steps/<id>/step.json` the sole mutable authority.
  - Alternative: persist `RunGraph.steps: StepRecord[]` and let graph definitions provide missing runnable steps.
  - Why: duplicating `status`, `result`, `latestAttemptId`, `lease`, `heartbeat`, or `retryPolicy` across graph and step records creates two sources for no-duplicate recovery. Missing/corrupt step records must block, not default to runnable state.
- Chosen: add store methods for graph, scheduler state, heartbeats, diagnostics, and step listing rather than letting the scheduler read `graphPath`/`schedulerStatePath` with `fs`.
  - Alternative: have scheduler read the file paths from `RunRecord` directly.
  - Why: the architecture separates store and scheduler contracts; direct file access would make later SQLite/remote store migration harder and violates the user's substrate constraint.
- Chosen: make persisted step/attempt records authoritative over in-memory scheduler maps and over stale scheduler snapshots.
  - Alternative: trust `scheduler.json` ready/lease maps directly.
  - Why: status/result correctness lives in `step.json` and attempts; `scheduler.json` is a reconstruction aid, not a source that may rerun completed work.
- Chosen: block stale non-resumable `canCommit` running work with no terminal attempt evidence by default.
  - Alternative: treat stale heartbeat as proof the prior work is safe to retry.
  - Why: current Drive adapters surface terminal output only through in-memory promises, so process death after an external commit but before `writeStepAttemptRecord` would otherwise duplicate committed work. Explicit `retryPotentiallyCommittedSteps` policy is required to take that risk.
- Chosen: leave fresh non-resumable running work externally owned rather than duplicating it, including when `staleHeartbeatMs` is absent.
  - Alternative: start a duplicate because the new scheduler has no in-memory handle.
  - Why: a fresh persisted heartbeat is evidence from the durable store; empty in-memory maps in a fresh process are not evidence that work stopped.
- Chosen: type Plan-3 scheduler registration as `RunGraphSchedulerBackend` (`SchedulerStepInput` -> `StepResult`) and exclude Drive adapters until Plan 4.
  - Alternative: accept `OrchestrationBackend<unknown, unknown>` and rely on `inputForStep` discipline.
  - Why: current Drive adapters require `BackendInvocation` fields and return `BackendRunResult`; erasing that contract lets the scheduler start a backend with invalid input.
- Chosen: normalize malformed backend output to blocked `unknown` rather than treating backend process completion as success.
  - Alternative: trust zero exit/status from backend adapters.
  - Why: `D-006` requires unknown-vs-success distinction before scheduler advances dependents.
- Chosen: prove sequential scheduling, leases, heartbeats, stale/fresh recovery, canCommit safety, retry, graph-state authority, cancellation, and crash recovery before adding bounded parallelism.
  - Alternative: implement parallel scheduling early because the graph model supports it.
  - Why: the architecture identifies scheduler correctness as the riskiest part; parallel mutable work is constrained until worktree policy is explicit.

## Files to Change

- `lib/durable-runtime/types.ts` - add `StepLease`, `StepHeartbeat`, `RetryPolicy`, `SchedulerState`, `RunGraphStep`, `RunGraph`, `ReadRunGraphResult`, `SchedulerStepInput`, `RunGraphSchedulerExitReason`, `RunGraphSchedulerResult`, optional scheduler fields on `StepRecord`, optional policy fields on `RunPolicy`, and `RunStore` method declarations for graph/state/heartbeat/diagnostic/step-list persistence. Preserve existing statuses and fields.
- `lib/durable-runtime/status.ts` - add step terminal/status-transition helpers used by scheduler and tests; keep run terminal helpers compatible.
- `lib/durable-runtime/file-store.ts` - implement `readRunGraph`, `writeRunGraph`, `readSchedulerState`, `writeSchedulerState`, `writeStepHeartbeat`, `readStepHeartbeat`, `listStepRecords`, and interface-level `appendDiagnostic` with run-owned path validation and atomic JSON writes; keep existing create/load/update/event/step/attempt behavior compatible.
- `lib/durable-runtime/scheduler-state.ts` - new pure reconciliation module for dependency readiness, graph-vs-step validation, stale/fresh classification, canCommit safety classification, retry eligibility, shared-worktree concurrency classification, cancellation decisions, recovery merge, and run-finalization decisions.
- `lib/durable-runtime/scheduler.ts` - new in-process scheduler entry point and lease/heartbeat/backend/concurrency/signal orchestration.
- `lib/durable-runtime/index.ts` - re-export new scheduler contracts and scheduler entry points.
- `tests/durable-runtime/scheduler-contracts.test.ts` - new B-001 and B-020 contract/status-drift/backend-registration tests.
- `tests/durable-runtime/scheduler-store.test.ts` - new B-002 store-boundary and persistence tests.
- `tests/durable-runtime/graph-scheduler.test.ts` - new B-003, B-004, and B-013 dependency/lease/finalization tests.
- `tests/durable-runtime/scheduler-heartbeats.test.ts` - new B-005 long-idle heartbeat test.
- `tests/durable-runtime/scheduler-retry.test.ts` - new B-007 and B-008 retry/block tests.
- `tests/durable-runtime/scheduler-recovery.test.ts` - new B-006, B-009, B-010, B-011, B-014, B-015, B-017, and B-018 crash/restart recovery and state-authority tests.
- `tests/durable-runtime/scheduler-parallelism.test.ts` - new B-012 and B-016 concurrency-limit and shared-worktree mutable-guard tests.
- `tests/durable-runtime/scheduler-cancellation.test.ts` - new B-019 signal cancellation tests.
- `tests/durable-runtime/file-store.test.ts` - update existing fixtures if needed for extended `RunStore`/`StepRecord` contract while preserving Plan-1/Plan-2 tests.
- `tests/durable-runtime/backend-contracts.test.ts` - update contract expectations only if new type exports affect the public API; do not weaken Plan-2 backend boundary assertions.

Files intentionally not changed in this plan:

- `lib/driver/durable-steps.ts` - remains the Drive event projector, not a scheduler.
- `lib/driver/backends/orchestration-adapter.ts` - no Drive-on-graph behavior in Plan 3 unless a type-only compatibility adjustment is required.
- `lib/driver/run-step.ts`, `lib/driver/run-run-loop.ts`, `lib/driver/run-one-task.ts`, and `cli/drive/subcommand.ts` - Drive keeps its current execution/resume loop until Plan 4.
- `lib/orchestration/*` - no chain compiler, chain loop migration, or dependency from durable runtime to orchestration modules.
- `domains/shared/extensions/orchestration/*` - read-only `run_status`/`run_watch` stay as Plan-1 controller surfaces; no mutating runtime controls are added.

## Risks

- **Crash recovery can duplicate committed work if persistence is not authoritative.** Mitigation: B-009, B-010, B-011, and B-014 are first-class recovery tests with fake backend call counters, terminal attempt promotion, and a commit-window side-effect counter. Abort if scheduler logic ever starts from empty in-memory maps without reading store records or retries a stale non-resumable `canCommit` open attempt without explicit policy.
- **Fresh-heartbeat recovery with non-resumable backends can duplicate or stall work.** Mitigation: B-015 defines fresh/no-threshold recovery as externally owned and non-duplicating; stale detection happens only after configured policy, and canCommit safety blocking takes precedence.
- **Status vocabulary drift can break Plan-1/Plan-2 compatibility.** Mitigation: B-001 pins the actual current unions and rejects `queued`, `waiting`, and `leased` members; leases are fields, not statuses.
- **Graph and step records can become dual mutable sources.** Mitigation: `RunGraphStep` excludes mutable fields; B-017 proves `step.json` wins over graph conflicts; B-018 proves missing/corrupt `step.json` blocks before execution.
- **Store/scheduler boundary can be bypassed because graph and scheduler paths are present on `RunRecord`.** Mitigation: add explicit `RunStore` methods and B-002 source inspection for scheduler persistence imports. Reviewer should reject direct scheduler `fs` reads/writes.
- **Backend input contracts can be erased.** Mitigation: B-020 types Plan-3 scheduler registration as `RunGraphSchedulerBackend` and excludes Drive adapters until Plan 4 provides a `BackendInvocation` builder.
- **`StepRecord.status: completed` might be treated as enough proof despite unknown result semantics.** Mitigation: scheduler terminal decisions inspect `StepResult`; malformed/non-`StepResult` backend output becomes blocked `unknown` per B-008 and `D-006`.
- **Retry loops can erase evidence or spin forever.** Mitigation: B-007 proves new attempt records are appended; B-008 proves exhausted/unknown outcomes block. Default max attempts is `1`.
- **Signal cancellation can either lose evidence or duplicate work.** Mitigation: B-019 releases leases only after confirmed backend cancellation; unsupported cancellation preserves running evidence and blocks duplicate replacement.
- **Bounded parallelism can accidentally run mutable shared work concurrently.** Mitigation: B-012 pins the numeric cap; B-016 proves shared-worktree `canCommit` backends are capped/diagnosed while isolated non-committing backends may run parallel. Worktree creation/merge remains out of scope.
- **Scope creep into Drive/chain migration.** Mitigation: keep scheduler tests under `tests/durable-runtime/`; do not touch Drive/chain frontend loops except type compatibility. Plan 4 owns graph compilers and wrappers.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native correctness evidence passes for the targeted scheduler tests plus the repository's configured correctness, lint, and type-safety checks | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Behavior-spine mechanical checks pass for `plan:durable-graph-scheduler`: every B-### has required fields, root-relative test references, and exact markers in the referenced tests after implementation | artifact evidence | hard fail after implementation creates referenced tests |
| 3 | `mutation` | bindable | unbound | Targeted negative tests prove realistic faults would fail: adding forbidden status literals (B-001), scheduler direct filesystem persistence (B-002), dependents ready before completed dependencies (B-003), mismatched lease holder renewal/release (B-004), default hard timeout killing heartbeating idle work (B-005), stale recovery fabricating empty memory defaults (B-006/B-010), retry overwriting attempts (B-007), unknown/exhausted results advancing dependents (B-008), completed/terminal attempt recovery duplicating backend starts (B-009/B-011), retrying potentially committed non-resumable work without terminal evidence (B-014), duplicating fresh externally-owned non-resumable work (B-015), active count exceeding `maxParallelSteps` (B-012), shared-worktree `canCommit` backends running concurrently without isolation (B-016), graph mutable fields overriding `step.json` or missing `step.json` defaulting runnable (B-017/B-018), signal cancellation releasing unconfirmed work or omitting cancellation evidence (B-019), and Drive adapters assignable to scheduler backends without a Plan-4 invocation builder (B-020) | project tests + reviewer judgment | no mutation tool is bound; degraded to targeted negative tests and reviewer reasoning |
| 4 | `boundary-conformance` | bindable | bound | `lib/durable-runtime/*` has no imports from Drive, CLI, domains, prompts, tasks, or orchestration chain modules except durable-runtime contracts; scheduler persists only through `RunStore`; no Drive/chain graph compiler, daemon, distributed scheduler, merge finalizer, or mutating controller is introduced | reviewer/static inspection, optionally grep-backed | hard fail if dependency direction or non-goal scope is violated |
| 5 | `complexity` | bindable | unbound | Scheduler core remains small: pure reconciliation in `scheduler-state.ts`, IO/backend loop in `scheduler.ts`, no speculative backend adapters, no worktree manager, no distributed locking, and bounded parallelism added only after sequential recovery/safety tests pass | reviewer judgment | unbound; reviewer must reject broad orchestration abstractions not demanded by B-### tests |
| 6 | `dead-code` | bindable | unbound | No unused public scheduler APIs, future backend stubs, daemon hooks, graph compiler stubs, or unused worktree/finalizer implementations are added | project-native static-analysis evidence + reviewer judgment | unbound for conceptual dead code; hard fail for configured unused-code failures |

## Implementation Order

1. **Contracts, graph authority, and store primitives first (RED/GREEN for B-001, B-002, and B-020).** Write `tests/durable-runtime/scheduler-contracts.test.ts` and `scheduler-store.test.ts` with markers. Add scheduler types and optional fields to `types.ts`, immutable `RunGraphStep`/`RunGraph` and scheduler result contracts, step helpers to `status.ts`, store graph/state/heartbeat/diagnostic/step-list methods to `RunStore` and `FileRunStore`, and exports from `index.ts`. Type the scheduler registry as `RunGraphSchedulerBackend` so Drive adapters cannot be registered without a Plan-4 invocation builder. Keep all existing Plan-1/Plan-2 tests green and reject any status-union drift.
2. **Pure sequential graph reconciliation and mutable-state authority (RED/GREEN for B-003, B-017, and B-018).** Create `scheduler-state.ts` with dependency readiness, graph-vs-step validation, and persisted-state merge helpers. Prove pending steps become ready only when dependencies are completed, `step_ready` is not duplicated, graph-embedded mutable fields are ignored/diagnosed, and missing/corrupt `step.json` blocks before execution. Do not start backend work yet except through simple fake-driven tests.
3. **Lease lifecycle and single-step execution (RED/GREEN for B-004 and B-013 basics).** Implement the minimal `scheduler.ts` drain/tick loop for one runnable step at a time. Acquire lease with `holderId`, create an open attempt before backend start, write initial heartbeat, start a scheduler-typed fake backend returning `StepResult`, release the lease on terminal result, append terminal step events, and finalize the run when all steps are terminal.
4. **Heartbeat, fresh external work, and stale detection before retry (RED/GREEN for B-005, B-006, and B-015).** Add heartbeat renewal while a backend handle is pending and stale/fresh classification from persisted heartbeat age on restart. Prove long-idle heartbeating work is not killed by a default hard timeout, stale restart reads persisted heartbeat/lease state rather than fabricating empty memory defaults, fresh non-resumable running work is left externally owned without duplicate starts, and absent `staleHeartbeatMs` means staleness is not inferred.
5. **Retry/block transitions with monotonic attempts (RED/GREEN for B-007 and B-008).** Add effective retry policy (`StepRecord.retryPolicy.maxAttempts`, fallback `RunPolicy.retryLimit + 1`, default `1`), retry requeue, and blocked unknown/exhausted handling. Ensure retries append `attempt-002+` and old attempts remain readable. Do not allow retry of potentially committed ambiguous work yet.
6. **Crash-recovery safety before any parallelism (RED/GREEN for B-009, B-010, B-011, and B-014).** Build the recovery entry path that loads graph topology, step records, scheduler state, heartbeat files, and attempts before selecting work. Prove completed steps are not rerun, ready queue/leases/heartbeats reconstruct from persisted records, terminal latest attempts are promoted without duplicate backend starts, and a crash after backend commit but before terminal attempt evidence blocks/diagnoses instead of re-executing `canCommit` work. If this step exposes ambiguous persisted state, block/diagnose rather than guessing.
7. **Signal cancellation before parallelism (RED/GREEN for B-019).** Wire `RunGraphSchedulerOptions.signal` into active scheduler handles. Confirm cancellable backends receive `cancel`, cancellation attempt evidence is persisted, leases release only after confirmed cancellation, and unsupported cancellation preserves running evidence without starting replacements.
8. **Bounded parallelism last (RED/GREEN for B-012 and B-016).** Add the scheduler-local limiter and `RunPolicy.maxParallelSteps` handling only after sequential, lease, heartbeat, stale/fresh, retry, cancellation, and crash-recovery safety tests pass. Default to `1`; enforce the explicit cap with pending fake backend handles; cap/diagnose shared-worktree `canCommit` backends to sequential while permitting isolated non-committing fakes to run in parallel.
9. **Compatibility and full verification.** Re-run all targeted scheduler tests, existing durable-runtime tests, and repository gates through the project's configured verification path. Then run the artifact-conformance gate after markers exist. If implementation requires Drive graph compilation, Drive `BackendInvocation` building, chain compiler changes, daemonization, mutating controls, per-step worktree creation, merge finalization, or broad backend result adapters, stop and split that into Plan 4 or a follow-up instead of expanding this plan.

## Reviewer Resolution

- `PR-001` (committed-work crash window): Resolved by new B-014, the `retryPotentiallyCommittedSteps` policy field in B-001/Public contracts, and the tightened `Crash recovery algorithm` plus `Event and store write order` sections. Recovery now blocks/diagnoses stale non-resumable `canCommit` work that lacks terminal attempt evidence instead of retrying and duplicating committed side effects.
- `PR-002` (fresh heartbeat + non-resumable recovery): Resolved by new B-015 and the `RunGraphSchedulerResult.exitReason` contract. The plan now defines fresh/no-threshold running work as externally owned, with zero backend starts, no new attempt, no fabricated heartbeat, and an explicit diagnostic/return state.
- `PR-003` (shared-worktree mutable concurrency): Resolved by new B-016, revised B-012, the `Bounded parallelism and worktree guard` section, and the mutation gate row. Shared-worktree `canCommit` backends are capped/diagnosed to sequential; isolated non-committing backends are the positive parallel case.
- `PR-004` (graph duplicates mutable step state): Resolved by replacing `RunGraph.steps: StepRecord[]` with immutable `RunGraphStep[]`, making `step.json` the sole mutable authority, adding B-017 for graph-vs-step conflicts, adding B-018 for missing/corrupt step records, and tightening the recovery algorithm to block rather than default missing step state.
- `PR-005` (backend registry erases input contracts): Resolved by typing Plan-3 scheduler registration as `RunGraphSchedulerBackend` (`SchedulerStepInput` -> `StepResult`), documenting the Plan-4 Drive `BackendInvocation` builder boundary, and adding B-020 as a contract test that rejects Drive adapters in the Plan-3 scheduler registry.
- `PR-006` (Quality Contract concrete commands): Resolved by removing concrete runnable command names and concrete artifact-check command text from the Quality Contract binding notes. The Quality Contract now refers only to project-native correctness/static-analysis/type-safety evidence and artifact evidence.
- Missing Coverage 1 (`RunGraphSchedulerOptions.signal`): Resolved by B-019 and the `Status and attempt transition rules`/`Event and store write order` signal clauses. Cancellation now has defined backend cancellation, lease release/preservation, attempt evidence, and run/step status behavior.
- Missing Coverage 2 (B-004 file ownership): Resolved in `## Files to Change`; `tests/durable-runtime/graph-scheduler.test.ts` now explicitly owns B-003, B-004, and B-013.
- Missing Coverage 3 (marker presence): Acknowledged in the Quality Contract artifact-conformance row. Exact marker presence is a post-implementation hard-fail gate after the referenced test files are created with `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers.
