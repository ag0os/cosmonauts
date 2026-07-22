---
title: Episodic-log detached-terminal & resume hardening
status: active
createdAt: '2026-07-21T22:17:10.000Z'
updatedAt: '2026-07-22T14:49:43.641Z'
---

## Overview

Correctness hardening for the *enabled* episodic-log Drive path: fix the seven
detached-terminal/resume edge defects deliberately deferred out of the shipped
`episodic-log` plan (agent-memory W3), plus the CDX-002 test-debt item. Enabled
Drive runs gain exactly-one, honestly attributed terminal episodes; detached
capture warnings reach the live parent session; status-transition episode counts
match persisted transitions; and plan locks no longer cover successful terminal
episode I/O.

The existing `.cosmonauts/config.json` `episodicLog.enabled` gate remains OFF by
default. This plan does not make an adoption decision. With the gate OFF, all
touched observable bytes remain identical to current `main`: session/manifest
layout, run/spec/completion files, legacy and normalized event ordering, CLI or
tool output text, and sequential plan/task update bytes. PRF-007 serialization
is entered only by episode-producing managers while the gate is ON, so OFF
concurrent update semantics also remain the current unlocked behavior. CDX-001
proved that enabled-path wiring can leak into layout, so OFF-state identity is a
behavior and a hard gate, not an inference.

`missions/archive/plans/episodic-log/qm-review.md` is the evidence of record for
F-003/UR-002, PRF-002/003/004/007, F-005, SR-001, and CDX-001/002. This plan does
not re-verify or reopen findings already shipped by `episodic-log`.

## Architecture Context

This plan implements a hardening slice under the existing memory architecture;
it does not create a new architecture record.

Relevant source-of-truth records:

- `missions/architecture/agent-memory.md` defines general/operational memory,
  including W3's append-only episodic run/decision log, plain-text human-owned
  records, pull retrieval, and the deferred adoption decision. This plan keeps
  the existing `MemoryStore` and `recordEpisode` boundaries intact.
- `missions/architecture/autonomy.md` defines the episodic log as durable
  wake-state and the autonomy audit log. Terminal ownership must reconstruct from
  persisted run/ledger records after restart; no in-memory terminal set may
  decide correctness.
- `missions/architecture/architectural-memory.md` explicitly keeps operational
  episodes in the sibling agent-memory track. No architecture-map, curated
  code-memory, embedding, or injection seam belongs in this change.

Inherited shipped contracts from
`missions/archive/plans/episodic-log/plan.md` remain authoritative:

- D-006: Drive-internal plan/task transitions stay capture-suppressed by
  construction.
- D-007: Drive actor identity is the frozen execution-resolved worker identity;
  reconcile-only resume preserves prior-attempt provenance.
- D-008: episode capture and warning delivery are fail-soft and non-load-bearing.
- D-009: completion-backed terminal identity is deterministic and content-derived;
  the terminal legacy event precedes the observable completion file, and the
  completion precedes episode capture.

`memory/episodic-log.md` is historical distilled evidence for the shipped W3
plan. `docs/memory.md` is the live behavior document and must change where F-005
changes terminal-only resume behavior.

## Decision Log

- **D-001 — Drain the detached bridge after a terminal; never reorder the terminal path**
  - Decision: preserve `emit terminal legacy event → write completion → capture episode`. When episodic identity is present, the JSONL bridge enters a post-terminal drain that forwards only `driver_diagnostic` events with `code === "episode_capture_failed"`, then finishes after child exit or a bounded fallback.
  - Alternatives: capture before the terminal event (rejected after a real happy-path ordering regression); write completion before the terminal event (rejects the completion⇒terminal invariant); two-phase completion (rejects a contract change for every consumer to fix a failure-of-a-failure path).
  - Why: the three ordering wants are mutually unsatisfiable with one completion write. A narrow bridge drain preserves all three consumers without changing child JSONL order.
  - Decided by: ratified pre-existing spec/plan direction.

- **D-002 — Persist an attempt-terminal ledger after successful capture**
  - Decision: `run.terminal-episodes/` contains one deterministic marker per attempt. Every normal, thrown, abort, settle, and resume terminal path reads it; successful capture writes it atomically afterward. Capture failure leaves no marker and remains retryable.
  - Alternatives: continue relying on control-flow convergence (already disproved by PRF-002/003/F-005); claim before capture (would make failed capture permanently non-retryable); an in-memory set (not restart-safe); a second terminal episode on reconciliation (violates D-009).
  - Why: exactly-one terminal becomes persisted mechanism rather than an emergent property of which process or catch path ran last. Store-level PRF-001 dedupe remains the concurrent identical-content backstop.
  - Decided by: ratified pre-existing plan direction.

- **D-003 — Trust execution-path frozen sources only when `agentId === "worker"`**
  - Decision: an attempt that will execute may reuse a frozen source only when its parsed agent id is exactly `worker`. Any other frozen source is prior provenance only; execution resolves the actual worker and mints identity from that resolution. Reconcile-only resume preserves the frozen source untouched.
  - Alternatives: trust every syntactically qualified source (leaves recorded≠executed open); discard all frozen sources (breaks legitimate stable worker provenance); apply the guard to reconcile-only resume (rewrites history).
  - Why: legitimate Drive sources are `<domain>/worker`; the guard closes the whole arbitrary-agent residual without changing valid inputs or prior-attempt provenance.
  - Decided by: ratified pre-existing spec/plan direction.

- **D-004 — Release terminal locks through a hook; serialize only enabled episode-transition ownership**
  - Decision: `RunDriveOnGraphCtx.onTerminalPersisted` fires once after completion persistence and before episode capture on completion-backed terminal paths; inline and detached-child callers pass idempotent `lock.release`. Hook rejection is isolated from the broad terminal catch, cannot reclassify the persisted result, and suppresses capture rather than running it under an unreleased lock. Separately, `PlanManager.updatePlan` and `TaskManager.updateTask` use a shared per-entity cross-process file lock around read→merge→write→transition-decision only when they carry episode context and the project gate resolves enabled; they release before capture. Other manager mutation paths remain out of scope.
  - Alternatives: move completion/capture ordering (rejected by D-009); release the plan lock only after capture (current PRF-004); use an in-memory mutex for status updates (not cross-session/process safe); lock OFF/context-free updates (violates byte/concurrency identity); serialize every manager mutation (unnecessary blast radius).
  - Why: both changes correctly place enabled critical sections without moving persistence ownership, turning hook failure into a second terminal, or changing OFF behavior.
  - Decided by: ratified pre-existing spec/plan direction (PRF-004 hook and PRF-007 scope), failure/OFF semantics clarified by plan review PR-001/PR-003.

F-005's synthetic attempt id is a separate ratified constraint, not an open
design choice: it is deterministic, derived from the persisted run id, and never
random. The gate remains OFF by default.

## Current State

`runDriveOnGraph` in `lib/driver/drive-graph-runner.ts` currently performs the
normal terminal path in this order:

1. `stampDriveEpisodeResult` conditionally stamps `completedAt`.
2. `emitTerminalLegacyEvent` writes/publishes `run_completed`/`run_aborted`.
3. `writeRunCompletion` writes `run.completion.json`.
4. `recordDriveTerminalEpisode` captures the episode and may append an
   `episode_capture_failed` diagnostic afterward.

The important surrounding seams are:

- `lib/driver/event-stream.ts` immediately calls `stop()` when it bridges a
  terminal, so the later diagnostic remains in child JSONL/durable storage but
  misses the detached parent bus.
- `lib/driver/driver.ts` passes `child`, `bridge`, and `workdirCreated` by value
  into `abortDetachedRun`; abort can therefore act on stale launch state.
- `lib/driver/driver.ts` and `lib/driver/run-step.ts` release the plan lock only
  in `.finally`, after episode capture. `run-step.ts` then redundantly rewrites
  completion. `domains/shared/extensions/orchestration/driver-tool.ts` also
  rewrites successful completion when a handle settles. CLI `runInlineMode`
  retains a post-result “write completion if missing” fallback. All three sit
  after the proposed hook boundary and must be removed from successful paths.
- A thrown graph exit records a wall-clock `failed` episode but no completion.
  CLI/tool settle writes an unstamped `aborted` completion; later resume stamps
  and captures it as a second terminal.
- `cli/drive/subcommand.ts` calls `prepareResume()` before the later episode
  identity mint seam. A terminal-only resume can return from `prepareResume`
  before line 338-style identity derivation, so F-005 identity preparation must
  occur before that early return.
- `PlanManager.updatePlan` and `TaskManager.updateTask` read status outside any
  update lock, then merge/write and decide capture from that stale read.

`LockHandle.release()` is idempotent but can reject on filesystem failures, and
`stampDriverResult()` preserves an existing `completedAt`. Both facts are
load-bearing for the failure-safe hook design.

## Behaviors

The authoritative spec lists nine unnumbered Acceptance Criteria bullets. For
traceability in this plan, `AC-001` through `AC-009` refer to those bullets in
listed order; the aliases do not amend or reinterpret `spec.md`.

### B-001 - OFF-state bytes and presentation remain identical

- Source: AC-001
- Context: `episodicLog.enabled` is absent or false across inline, detached, abort, resume, CLI/tool, and plan/task update paths touched by this plan
- Action: those paths execute with the hardening present
- Expected: session and manifest paths, serialized specs/results/completions, workdir file layout, legacy/normalized event order, CLI/tool output text, and sequential plan/task bytes equal current `main`; managers do not enter the new entity lock, so concurrent OFF updates retain current unlocked semantics; no terminal-ledger, update-lock, or memory episode artifact remains
- Seam: all production files named in `Files to Change`, including enabled-gate selection in `lib/memory/episode-transition-lock.ts`
- Test: `tests/driver/drive-on-graph-routing.test.ts` > `keeps OFF-state Drive files events layout and output byte-identical across hardened paths`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-001`
- Additional evidence: exact assertions in `tests/cli/drive/run.test.ts`, `tests/extensions/orchestration-driver-{tool,detached}.test.ts`, `tests/driver/backends/cosmonauts-subagent-resolution.test.ts`, `tests/plans/plan-manager.test.ts`, `tests/tasks/task-manager.test.ts`, and `tests/memory/episode-transition-lock.test.ts`

### B-002 - Detached terminal capture failures reach the live parent bus

- Source: AC-002
- Context: an enabled detached child emits its terminal legacy event, writes completion, then terminal episode capture fails
- Action: the parent bridge drains the child's JSONL
- Expected: exactly one `episode_capture_failed` `driver_diagnostic` is published to the owning parent session bus in addition to its existing legacy JSONL and durable evidence; the primary result is unchanged
- Seam: `lib/driver/event-stream.ts` and `lib/driver/driver.ts`
- Test: `tests/driver/driver-detached.test.ts` > `bridges a post-terminal episode capture failure to the detached parent bus`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-002`

### B-003 - Post-terminal drain forwards no unrelated events

- Source: AC-002
- Context: an enabled bridge sees a terminal followed by task/activity/general diagnostics and an `episode_capture_failed` diagnostic
- Action: it processes the post-terminal bytes before `finish()`
- Expected: the terminal and the allowlisted episode-capture diagnostic are published in file order; every other post-terminal event is suppressed
- Seam: `bridgeJsonlToActivityBus` in `lib/driver/event-stream.ts`
- Test: `tests/driver/event-stream-bridge.test.ts` > `drains only episode capture diagnostics after a terminal event`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-003`

### B-004 - Detached drain has a bounded exit

- Source: AC-002
- Context: an enabled child writes completion and a terminal but does not exit
- Action: `startDetached` waits for post-terminal drain closure
- Expected: the handle result settles after the bounded fallback, the bridge performs one final poll and stops, and no watcher/timer is left live; abort still hard-stops immediately
- Seam: `lib/driver/driver.ts` and `JsonlActivityBusBridge.finish()` in `lib/driver/event-stream.ts`
- Test: `tests/driver/driver-detached.test.ts` > `bounds post-terminal bridge drain when the child does not exit`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-004`

### B-005 - Terminal legacy event still precedes observable completion

- Source: AC-002
- Context: inline Drive reaches any completion-backed terminal outcome, including capture failure
- Action: a consumer observes `run.completion.json` and tails legacy events
- Expected: the terminal legacy event is already present before completion becomes observable; capture and its narrowly permitted capture-failure diagnostic remain after completion; the reverted reorder stays absent
- Seam: terminal sites in `lib/driver/drive-graph-runner.ts`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `emits the terminal legacy event before completion and captures afterward`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-005`

### B-006 - Thrown exit plus settle records one failed terminal

- Source: AC-003
- Context: an enabled attempt throws after start and records its `failed` terminal, then CLI or driver-tool settle writes fallback completion
- Action: all terminal writers consult the persisted attempt marker
- Expected: the attempt has one terminal episode with outcome `failed`; settle adds no `aborted` episode, and a stamped completion already on disk is never replaced by an unstamped fallback
- Seam: `lib/driver/drive-graph-runner.ts`, `lib/driver/run-state.ts`, `cli/drive/subcommand.ts`, and `domains/shared/extensions/orchestration/driver-tool.ts`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `keeps a thrown attempt at one failed terminal when settle writes fallback completion`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-006`

### B-007 - Thrown exit remains one terminal after fresh-process resume

- Source: AC-003
- Context: the process that recorded the thrown `failed` terminal exits and a later process resumes the run
- Action: resume reconstructs terminal ownership from `run.terminal-episodes/`
- Expected: no `aborted` terminal is added for the same attempt; correctness does not depend on an in-memory cache
- Seam: `lib/driver/run-state.ts` and `persistResumeTerminal` in `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/graph-resume.test.ts` > `rehydrates the attempt ledger and skips a second terminal after thrown-exit resume`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-007`

### B-008 - Pre-spawn abort terminates a child that appears in the race window

- Source: AC-004
- Context: abort is injected after the last pre-spawn abort check but before the spawned child is published to launch state
- Action: `DriverHandle.abort()` signals cancellation, yields, then re-reads shared live launch state
- Expected: a child that appears in that window receives termination and is awaited; no live process leaks
- Seam: live `DetachedLaunchState` in `lib/driver/driver.ts`
- Test: `tests/driver/driver.test.ts` > `terminates a detached child published during the pre-spawn abort window`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-008`

### B-009 - Pre-spawn abort and resume produce at most one terminal

- Source: AC-004
- Context: enabled pre-spawn abort races with child completion and a later resume
- Action: parent, child, settle, and resume use one attempt id and the persisted ledger
- Expected: the attempt has at most one terminal episode and no duplicate outcome pair
- Seam: `lib/driver/driver.ts`, `lib/driver/drive-graph-runner.ts`, and `lib/driver/run-state.ts`
- Test: `tests/driver/driver-detached.test.ts` > `keeps pre-spawn abort and resume to one terminal attempt`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-009`

### B-010 - Fallback writers never downgrade stamped completion

- Source: AC-004; AC-003
- Context: `run.completion.json` already contains a result with `completedAt`
- Action: CLI, driver-tool settle, or parent-abort fallback handling runs
- Expected: the existing completion bytes and outcome remain untouched; fallback replacement is allowed only when completion is absent or currently unstamped
- Seam: completion helpers in `lib/driver/run-state.ts` and their CLI/tool/driver callers
- Test: `tests/driver/run-state.test.ts` > `preserves stamped completion bytes against fallback writers`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-010`

### B-011 - Off-then-enabled terminal-only resume captures one deterministic terminal

- Source: AC-005
- Context: a completed run has no frozen episode identity because logging was OFF, logging is enabled, and the current worker resolves successfully before terminal-only `--resume`
- Action: CLI prepares reconciliation identity before `prepareResume()` can return
- Expected: it derives the attempt id solely from the persisted run id, persists the resolved source and id into `spec.json`, preserves existing `completedAt` or stamps once, and records exactly one terminal episode without a start episode
- Seam: pre-`prepareResume()` identity preparation in `cli/drive/subcommand.ts` and `lib/driver/episode-identity.ts`
- Test: `tests/cli/drive/graph-resume.test.ts` > `records one run-id-derived terminal for an off-then-enabled completed resume`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-011`

### B-012 - Repeating terminal-only resume is byte- and episode-idempotent

- Source: AC-005
- Context: B-011 has already persisted the deterministic identity, completion, marker, and terminal episode
- Action: the same `--resume` runs again in a fresh process
- Expected: the derived id is identical, completion/spec bytes are identical, and no new terminal episode or marker is created
- Seam: `deriveDriveEpisodeAttemptId`, `stampDriverResult`, ledger reads, and `persistResumeTerminal`
- Test: `tests/cli/drive/graph-resume.test.ts` > `repeats deterministic terminal-only resume without changing bytes or episode count`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-012`

### B-013 - Live memory documentation matches terminal-only resume

- Source: AC-005
- Context: a human reads the fresh-process Drive reconstruction contract
- Action: they inspect `docs/memory.md`
- Expected: it states that off-then-enabled terminal-only resume derives and persists a deterministic run-id attempt id when a source resolves, records one terminal, dedupes repeated resumes, and warns/skips capture honestly when source resolution fails; it no longer presents the unconditional skip as deliberate
- Seam: `docs/memory.md`
- Test: `tests/memory/interface.test.ts` > `documents deterministic off-then-enabled terminal-only resume`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-013`

### B-014 - Concurrent enabled plan updates count actual persisted transitions

- Source: AC-006
- Context: two episode-producing sessions in an enabled project update one plan status concurrently, including same-target and different-target cases
- Action: each `PlanManager.updatePlan` runs under the same per-plan file lock and captures after release
- Expected: each writer reads the status produced by the prior serialized writer; episode count and previous→current details equal actual persisted transitions, with no episode for a same-status write
- Seam: `lib/plans/plan-manager.ts` through `lib/memory/episode-transition-lock.ts`
- Test: `tests/plans/plan-manager.test.ts` > `serializes enabled same-plan status transition decisions across manager instances`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-014`

### B-015 - Concurrent enabled task updates count actual persisted transitions

- Source: AC-006
- Context: two episode-producing sessions in an enabled project update one task status concurrently, including a status-driven filename change
- Action: each `TaskManager.updateTask` runs under the same per-task file lock and captures after release
- Expected: read, old filename selection, merge, write/rename, and transition decision share one critical section; episode count and details equal actual transitions, with no lost/duplicate task file
- Seam: `lib/tasks/task-manager.ts` through `lib/memory/episode-transition-lock.ts`
- Test: `tests/tasks/task-manager-concurrency.test.ts` > `serializes enabled same-task updates and records only actual status transitions`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-015`

### B-016 - Inline Drive releases its plan lock before terminal episode I/O

- Source: AC-007
- Context: an inline completion-backed terminal has been persisted and the terminal hook succeeds
- Action: `runDriveOnGraph` invokes `onTerminalPersisted` before capture
- Expected: the plan lock release has completed when episode capture and its capture-failure reporter run; no primary git/run/completion/terminal write occurs afterward; `.finally` remains the backstop
- Seam: `RunDriveOnGraphCtx` in `lib/driver/drive-graph-runner.ts`, `runInline` in `lib/driver/driver.ts`, and CLI completion ownership in `cli/drive/subcommand.ts`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `invokes terminal-persisted hook after completion and before capture on every completion-backed outcome`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-016`

### B-017 - Detached child releases its plan lock before terminal episode I/O

- Source: AC-007
- Context: the compiled child reaches a completion-backed terminal and the terminal hook succeeds
- Action: `run-step` supplies `lock.release` through `onTerminalPersisted`
- Expected: capture observes the lock absent; the redundant post-run completion rewrite is removed; thrown paths still release through `.finally`
- Seam: `lib/driver/run-step.ts`
- Test: `tests/driver/run-step.test.ts` > `releases the detached plan lock after completion and before episode capture`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-017`

### B-018 - Cross-plan commit serialization is unchanged

- Source: AC-007
- Context: two detached runs for different plans commit concurrently in one repository
- Action: early plan-lock release occurs only after all primary git/run-store/completion work owned by the graph is complete
- Expected: repository commit lock evidence and commit order remain serialized exactly as before
- Seam: `lib/driver/drive-graph-runner.ts`, `lib/driver/run-step.ts`, and existing repo commit locking
- Test: `tests/driver/cross-plan-commit-lock.test.ts` > `serializes driver-owned commits across detached runs in one repo`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-018`

### B-019 - CDX-002 unavailable frozen worker regression is executable

- Source: AC-008
- Context: persisted resume state has a frozen source whose worker no longer resolves, non-empty `remainingTaskIds`, and inline `cosmonauts-subagent`
- Action: CLI resumes and executes through the fallback worker
- Expected: the resumed spec omits stale `episodeSource` and `episodeAttemptId`, the fallback worker executes, and no episode names the stale source; the test fails against pre-CDX-002 behavior
- Seam: execution-path resume in `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/graph-resume.test.ts` > `drops an unavailable frozen worker before execution and never attributes the fallback to it`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-019`

### B-020 - Arbitrary frozen agents are provenance-only on execution

- Source: AC-008; Scope SR-001 residual
- Context: an executing resume contains a syntactically valid frozen source whose agent id is not `worker`
- Action: execution identity is prepared
- Expected: the source is not trusted for selection or episode attribution; the actual resolved worker supplies a new attempt identity, while a reconcile-only resume of the same artifact keeps its prior source as provenance
- Seam: `lib/driver/episode-identity.ts` and `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/run.test.ts` > `trusts only frozen worker agent ids for execution and preserves reconcile provenance`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-020`

### B-021 - Full repository verification remains green

- Source: AC-009
- Context: B-001 through B-020 and B-022 through B-025 are integrated as one change set
- Action: the project verification protocol runs
- Expected: the full 2,645-test green baseline plus new regressions passes, and lint and type checking report no errors
- Seam: project scripts in `package.json` and the Quality Contract below
- Test: `tests/driver/drive-on-graph-routing.test.ts` > `integrates detached hardening without regressing the Drive baseline`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-021`

### B-022 - Ledger markers are success-only and capture remains retryable

- Source: AC-003; AC-004; AC-005
- Context: terminal capture fails before a marker exists, then the same attempt is retried after the store recovers
- Action: `recordDriveTerminalEpisode` executes twice
- Expected: the failed capture writes no marker and emits the established non-fatal warning; the successful retry records the terminal and then atomically writes one marker; later retries skip capture
- Seam: `lib/driver/drive-graph-runner.ts` and `lib/driver/run-state.ts`
- Test: `tests/driver/run-state.test.ts` > `marks an attempt only after successful terminal capture and permits retry after failure`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-022`

### B-023 - Rejecting terminal hook cannot create a second terminal path

- Source: AC-007; AC-003
- Context: completion and its terminal legacy event are persisted, then `onTerminalPersisted` rejects
- Action: the completion-backed terminal helper handles the hook rejection
- Expected: the persisted result/completion and terminal event remain authoritative; the broad graph catch is not entered, no `run_aborted` or `failed` terminal is emitted, episode capture is skipped rather than run under the unreleased lock, the rejection is reported non-fatally, and caller backstop release failure cannot replace the result
- Seam: `lib/driver/drive-graph-runner.ts`, `lib/driver/driver.ts`, and `lib/driver/run-step.ts`
- Test: `tests/driver/drive-on-graph-acceptance.test.ts` > `preserves the persisted terminal when onTerminalPersisted rejects`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-023`

### B-024 - No successful completion writer remains after the terminal hook

- Source: AC-007; AC-002
- Context: graph-runner returns a completion-backed result through CLI, compiled child, or driver-tool ownership
- Action: each caller settles
- Expected: `runDriveOnGraph` remains the sole successful completion writer; CLI, run-step, and driver-tool do not rewrite or synthesize completion after hook/capture; missing completion on a returned result is treated as a contract error, not repaired post-hook
- Seam: `cli/drive/subcommand.ts`, `lib/driver/run-step.ts`, and `domains/shared/extensions/orchestration/driver-tool.ts`
- Test: `tests/cli/drive/run.test.ts` > `does not write successful completion after the graph terminal hook`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-024`

### B-025 - Terminal-only resume warns and skips when source resolution fails

- Source: AC-005
- Context: logging is enabled for a completed source-less run, but runtime or worker resolution fails before terminal-only resume reconciliation
- Action: pre-`prepareResume()` identity preparation runs
- Expected: one bounded launch warning is emitted, no episode identity is added to the spec, no terminal marker or episode is created, and the existing primary completion/result semantics remain unchanged; the early return is reached only after this failure decision
- Seam: pre-`prepareResume()` runtime/source resolution in `cli/drive/subcommand.ts`
- Test: `tests/cli/drive/graph-resume.test.ts` > `warns and skips terminal capture when off-era resume source cannot resolve`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-025`

## Design

### 1. One persisted completion/outcome contract

Completion-backed terminal sites keep the observable order:

1. stamp the result only when a complete episode identity is frozen;
2. emit the terminal legacy event;
3. write `run.completion.json`;
4. invoke `onTerminalPersisted` once;
5. capture/diagnose the terminal episode through the ledger.

No F-003 reorder is allowed. The thrown path still has no completion: it records
its wall-clock `failed` terminal through the same ledger and rethrows. Callers'
`.finally` release remains its backstop.

`lib/driver/types.ts` defines:

```ts
export type TerminalPersistedHook = () => void | Promise<void>;
```

`RunDriveOnGraphCtx` adds optional `onTerminalPersisted?:
TerminalPersistedHook`. A private completion-backed terminal helper owns steps
3–5 for finalization-failed, normal, and `EventLogWriteError` result paths.

The helper catches hook rejection *inside the terminal helper*, after completion
but before capture. It reports a bounded non-fatal lock-release warning, skips
capture, and returns the already-persisted result. The rejection never reaches
`runDriveOnGraph`'s broad catch, so it cannot emit `run_aborted`, record a
`failed` terminal, or replace the result. Caller `.finally` still attempts the
idempotent release but catches/report its own rejection so a release failure
cannot override the authoritative result.

After a successful hook, only episode-store I/O and the established
`episode_capture_failed` legacy/durable/bus diagnostic may occur. No primary git,
durable run/step, completion, or terminal-legacy write may occur. Remove all
successful post-hook completion writers: `run-step.ts`'s redundant rewrite,
driver-tool's successful settle rewrite, and CLI `runInlineMode`'s
write-if-missing branch. A returned completion-backed result with no completion
file is a contract error; callers do not repair it after the hook.

### 2. Attempt-terminal ledger and fallback completion guard

`lib/driver/run-state.ts` owns filesystem state; domain episode logic depends on
it, never the reverse. Add:

```ts
readRunCompletion(workdir: string): Promise<DriverResult | undefined>
writeFallbackRunCompletion(
  workdir: string,
  fallback: DriverResult,
): Promise<DriverResult>
hasRecordedDriveTerminal(workdir: string, attemptId: string): Promise<boolean>
markDriveTerminalRecorded(workdir: string, attemptId: string): Promise<void>
```

The marker path is
`run.terminal-episodes/<sha256(attemptId)>.json`; hashing prevents path traversal
or target-project filename variance. Marker bytes contain only version `1` and
the exact attempt id—no wall clock, mtime, random value, or outcome—so redundant
writes converge byte-for-byte. Marker reads validate the content. The directory
is created only after an identity-bearing capture succeeds; OFF runs never touch
it.

Normal and thrown terminal capture:

1. derive the complete frozen identity;
2. read the persisted marker;
3. skip when already recorded;
4. call `recordEpisode`;
5. write the marker only when the result is `recorded`.

Ledger read/write failure stays non-load-bearing and uses the existing
`episode_capture_failed` reporter. Failed or disabled capture does not claim the
attempt. Write-after-success intentionally preserves retryability; PRF-001 store
dedupe remains the identical-concurrent-writer backstop.

`writeFallbackRunCompletion` reads current content before fallback persistence.
If current content has `completedAt`, it returns that authoritative result and
does not rewrite a byte. If content is absent or unstamped, it preserves existing
fallback behavior. CLI inline rejection, driver-tool rejection/launch failure,
and parent abort use this contract. Live-state termination removes the child
writer race before parent fallback inspection.

### 3. Enabled-only post-terminal bridge drain

`JsonlActivityBusBridge` becomes:

```ts
interface JsonlActivityBusBridge {
  stop(): void;
  finish(): Promise<void>;
}
```

The bridge has `active | draining | stopped` state. With
`bridgeDriverDiagnostics !== true`, terminal handling remains today's immediate
stop. With complete enabled identity, publishing a terminal transitions to
`draining`; subsequent lines advance the cursor but only
`driver_diagnostic(code === "episode_capture_failed")` reach the bus. `finish()`
serializes with any active poll, performs one final poll, closes watchers/timers,
and is idempotent with `stop()`.

`startDetachedProcess` waits for completion as today, then—only for an enabled
drain—waits for child exit up to an internal 2,000 ms constant. Child exit or
timeout is followed by `await bridge.finish()`. Timeout bounds parent result
latency and bridge liveness; it does not kill a child that already produced
completion. Abort always calls `stop()` before termination and never drains.

### 4. Live detached launch state

`startDetached` owns one mutable object:

```ts
interface DetachedLaunchState {
  child?: ChildProcess;
  bridge?: JsonlActivityBusBridge;
  workdirCreated: boolean;
}
```

Launch callbacks mutate it; abort receives the object, not snapshots. Abort
hard-stops the current bridge, calls `controller.abort()`, yields one microtask so
a synchronous spawn already in progress can publish its child, then re-reads
live state. If a child exists, abort terminates and awaits it. Only afterward does
it re-read `workdirCreated`, inspect guarded completion, and reconcile the
ledger.

The deterministic race test mocks `spawn` so `handle.abort()` is invoked inside
the last-check→child-publication window. No production-only sleep or random
stress loop is acceptable.

### 5. Deterministic terminal-only resume identity

Add to `lib/driver/episode-identity.ts`:

```ts
deriveDriveEpisodeAttemptId(runId: string): string
isDriveEpisodeWorkerSource(source: string): boolean
```

The F-005 helper uses a namespaced SHA-256 of the persisted run id and returns a
stable `attempt-...` token. It never calls `randomUUID`; ordinary new execution
attempts continue using the existing mint function, while this synthetic
prior-attempt reconciliation id is always run-derived.

Before `prepareResume()` can return, gate-ON terminal-only resume preparation:

- preserves frozen source/attempt identity when complete;
- derives the run-id attempt id when source exists but attempt is missing;
- when both are absent, creates the runtime and resolves the source once under
  D-007, then pairs it with the deterministic id;
- persists enriched identity through `writeDriverWorkdirInputs` before
  `persistResumeTerminal`;
- if runtime/source resolution fails, reports once, leaves identity absent, and
  intentionally lets `prepareResume` return the unchanged primary result without
  capture or marker.

This preparation helper is called explicitly between `loadResumeDefaults` and
`prepareResume`; it cannot live only in the later execution mint branch.
Reconcile-only resumes do not use the SR-001 execution guard.
`stampDriverResult` preserves existing `completedAt`; deterministic spec plus
ledger makes the second successful resume byte- and episode-idempotent.

For an executing resume, parse the frozen qualified id before trusting it. If
`agentId !== "worker"`, retain it only as historical input, resolve the actual
worker, and mint the executing attempt from that resolution. If a legitimate
frozen worker is unavailable for inline execution, preserve CDX-002: omit
identity and execute fallback without misattribution.

### 6. Terminal-persisted hook and lock ownership

`runInline` and `run-step` pass idempotent `lock.release` as
`onTerminalPersisted`; their `.finally` calls remain backstops. Both hook and
backstop release failures are contained as described in Design 1. A failed hook
never runs episode capture while the lock may remain held and never enters a
second terminal path.

All primary git operations, durable run/step writes, terminal legacy emission,
and completion persistence precede the hook. Post-hook capture may write the
episode and, on failure, its exact `episode_capture_failed` diagnostic; this
narrow diagnostic is intentionally allowed and is the payload the bridge drain
exists to deliver. The cross-plan repo-commit suite guards primary serialization.

### 7. Enabled per-entity status-transition serialization

Create `lib/memory/episode-transition-lock.ts` as the single shared owner:

```ts
withEpisodeTransitionLock<T>(options: {
  projectRoot: string;
  lockPath: string;
  hasEpisodeContext: boolean;
  action: () => Promise<T>;
}): Promise<T>
```

If `hasEpisodeContext` is false, the helper calls `action` directly. Otherwise it
loads the current project gate fail-soft; absent/false/config-load failure also
calls `action` directly, preserving baseline manager semantics (the later
`recordEpisode` call remains the established warning owner for config failure).
Only literal enabled enters a waiting, stale-process-safe, owner-checked file
lock.

Plan/task managers derive safe colocated lock paths that are not markdown-scanned
and call this helper around the authoritative read, not-found check, old filename
(for tasks), merge, primary write/rename, optional plan spec write, and
previous/current status decision. The helper releases in `finally`; only then
does existing fail-soft episode capture run.

Lock files use exclusive creation, owner PID+nonce content, stale-owner recovery,
and owner-checked idempotent release. They leave no final artifact. No in-memory
mutex participates. `createPlan`, `createTask`, delete/archive, context-free
Drive managers, gate-OFF updates, and unrelated mutation paths are unchanged.

## Files to Change

- `lib/driver/run-state.ts` — attempt-marker paths/read/write, shared completion read, and stamped-completion fallback guard. Tests: `tests/driver/run-state.test.ts`.
- `lib/driver/drive-graph-runner.ts` — completion-backed hook sequence and rejection isolation; normal/thrown ledger checks; success-only marker write; fail-soft diagnostics. Tests: `tests/driver/drive-on-graph-{acceptance,recovery}.test.ts`.
- `lib/driver/event-stream.ts` — `JsonlActivityBusBridge.finish()`, drain states, exact post-terminal allowlist, cleanup serialization. Tests: `tests/driver/{event-stream-bridge,event-stream}.test.ts`.
- `lib/driver/driver.ts` — live launch state, abort reread, drain finish/timeout, inline hook, non-overriding backstop release, guarded fallback. Tests: `tests/driver/{driver,driver-detached,drive-on-graph-routing}.test.ts`.
- `lib/driver/types.ts` — shared `TerminalPersistedHook` type only; no result/spec field becomes required. Covered by driver tests and typecheck.
- `lib/driver/run-step.ts` — pass hook, contain backstop release rejection, remove redundant successful completion rewrite. Test: `tests/driver/run-step.test.ts`.
- `lib/driver/episode-identity.ts` — deterministic run-id-derived F-005 id and exact `agentId === "worker"` predicate; existing new-attempt mint remains. Tests: `tests/cli/drive/{run,graph-resume}.test.ts`.
- `cli/drive/subcommand.ts` — pre-`prepareResume` identity/failure decision, execution-only source guard, resume ledger, guarded rejection fallback, and removal of successful write-if-missing. Tests: `tests/cli/drive/{run,graph-resume}.test.ts`.
- `domains/shared/extensions/orchestration/driver-tool.ts` — remove successful settle rewrite and route rejection/launch fallback through stamped-completion guard. Test: `tests/extensions/orchestration-driver-tool.test.ts`.
- **New:** `lib/memory/episode-transition-lock.ts` — enabled/context-aware gate selection plus one waiting cross-process entity-lock implementation; imports Node filesystem/config only and depends on neither plan nor task modules.
- **New:** `tests/memory/episode-transition-lock.test.ts` — enabled acquisition/wait/stale cleanup/owner release and absent/false/context-free/config-failure bypass.
- `lib/plans/plan-manager.ts` — derive per-plan lock path; run update read→write→decision through shared helper; release before capture. Test: `tests/plans/plan-manager.test.ts`.
- `lib/tasks/task-manager.ts` — derive per-task lock path; run update read/rename/write→decision through shared helper; release before capture. Tests: `tests/tasks/{task-manager,task-manager-concurrency}.test.ts`.
- `docs/memory.md` — reconcile fresh-process reconstruction with deterministic terminal-only resume and resolution-failure behavior. Test: `tests/memory/interface.test.ts`.
- `tests/driver/backends/cosmonauts-subagent-resolution.test.ts` — retain CDX-001 exact plain-`worker` role/session-layout regression; production backend code is unchanged.
- `tests/extensions/orchestration-driver-detached.test.ts` — retain/extend absent/false detached spec and output parity.
- `tests/driver/cross-plan-commit-lock.test.ts` — attach B-018 evidence; production repo-commit lock is unchanged.

`memory/episodic-log.md` remains historical shipped-plan memory and is not
rewritten. No config loader, memory-store schema, episode serializer, agent-memory
extension, architecture-map, or gate default changes.

## Risks

- **Drain liveness and late bytes:** `finish()` must serialize a final read before
  cleanup; the 2 s child-exit bound must be fake-timer tested. If leak-free
  cleanup cannot be proven, stop and revise the bridge API.
- **Ledger write-after-success race:** two truly concurrent different outcomes
  could both pass a pre-check. Current paths serialize through child exit/settle,
  and identical races dedupe in the store. If a reachable different-outcome race
  appears, stop and redesign the claim protocol rather than weaken exactly-once.
- **Hook/release failure:** once completion exists, no rejection may reach the
  broad terminal catch or caller result. Capture is skipped when release fails;
  only bounded failure reporting and a contained backstop release attempt remain.
- **Post-hook ownership:** successful paths must have no primary git, run/step,
  completion, or terminal-legacy write after the hook. Episode persistence and
  its exact `episode_capture_failed` diagnostic are deliberately allowed.
- **Enabled lock selection:** any entity lock acquisition with absent/false gate,
  context-free manager, or config-load failure is OFF drift. Any need to lock
  create/delete/archive or unrelated mutations is a stop-and-split condition.
- **OFF-state drift:** any changed session/manifest path, serialized optional
  field, event order, output text, manager baseline bytes, or residual marker/
  lock file is a hard failure. Do not weaken exact assertions.
- **Resume placement/cost:** source resolution before terminal-only early return
  is gate-ON only. Failure must decide warn/skip before `prepareResume`; gate OFF
  must not create a runtime.
- **Target-project variance:** attempt/entity ids never become unsafe raw path
  segments. Safe names and root-relative workdirs must work in monorepos and
  unusual nesting.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Current 2,645-test baseline plus all B-001–B-025 regressions passes; lint and type checks are clean | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every behavior has required fields, a root-relative evidence file, and exactly one matching marker near its executable test | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negatives kill terminal reordering, random F-005 ids, marker-before-capture, stale launch snapshots, bridge over-forwarding, stamped downgrade, hook-rejection reclassification, post-hook caller writes, failed-resolution fallthrough, non-worker trust, stale manager reads, OFF lock acquisition, and OFF-layout leakage | pending | unbound; targeted tests plus reviewer judgment required |
| 4 | `boundary-conformance` | bindable | bound | Gate remains OFF; run-state owns terminal persistence; hook failure cannot create a terminal; enabled entity locks release before capture; no architecture/MemoryStore surface widens | project-discovered | hard fail through exact tests and source review |
| 5 | `duplication` | bindable | unbound | One terminal ledger, fallback guard, bridge drain, terminal helper, and entity-transition lock implementation exist | pending | unbound; reviewer judgment required |

Project bindings, run in order:

1. `bun run test` — user-provided current baseline is 2,645 green tests; any
   regression or new failure blocks shipping.
2. `bun run lint` — hard fail.
3. `bun run typecheck` — hard fail.

Plan-specific proof obligations:

1. OFF exact comparisons cover session/manifest layout, file bytes, event order,
   output text, and entity-lock bypass.
2. Fresh-process thrown/abort/resume tests prove exactly one terminal from disk,
   including success-only marker retry.
3. Detached tests prove the live parent receives only the allowlisted diagnostic
   and the drain cannot remain live indefinitely.
4. Inline ordering proves terminal event before completion before capture; the
   reverted reorder must fail.
5. F-005 proves run-derived persisted identity and repeat idempotence, plus
   explicit warn/skip when source cannot resolve.
6. Cross-manager tests assert actual transition counts, not lock calls; OFF
   manager tests prove no lock entry.
7. Hook timing/rejection tests prove release-before-capture on success and no
   terminal/result mutation on rejection; cross-plan commits remain serialized.
8. Source honesty covers unavailable legitimate workers and valid non-worker
   frozen sources.

## Implementation Order

Every stage follows RED → GREEN → REFACTOR one behavior at a time. If a stage
requires changing a ratified ordering, gate default, architecture boundary, or
scope exclusion, stop and revise this plan rather than improvising.

1. **Attempt-terminal ledger (B-022 foundation).** RED marker path/content,
   fresh-process read, success-only write, and fail-soft error behavior. Wire all
   terminal builders through it without changing order. This establishes the
   shared D-009 completion/outcome contract.
2. **PRF-003 thrown/settle/resume (B-006, B-007, B-010).** Depends on 1. RED
   failed→settle and failed→fresh-resume. Add stamped fallback guard, route CLI/
   tool fallback writers through it, and remove successful tool rewriting.
3. **PRF-002 live abort state (B-008, B-009).** Depends on 1–2. Replace snapshots,
   add deterministic mocked-spawn race, terminate/await before completion
   reconciliation, and reuse ledger/guard.
4. **F-003/UR-002 bridge drain (B-002–B-005).** Depends on 1–3 and never reorders
   them. RED allowlist, final poll, timeout, abort stop, parent bus, and terminal-
   before-completion; implement `finish()` and enabled-only drain.
5. **F-005 deterministic terminal-only identity (B-011–B-013, B-025).** Depends
   on 1–4. RED successful off-then-enabled, repeat resume, and runtime/source
   failure before `prepareResume`; derive/persist run-id identity, reuse ledger,
   and reconcile docs. **Stages 1–5 form one atomic delivery checkpoint and must
   ship together**; no subset is mergeable because all share D-009 ownership.
6. **SR-001 execution guard (B-020).** Depends on 5. RED executing non-worker and
   reconcile provenance; enforce exact `agentId === "worker"` only on execution.
7. **PRF-004 terminal hook (B-016–B-018, B-023, B-024).** Depends on stable 1–5.
   RED hook order and rejection for all completion-backed outcomes. Isolate
   rejection from broad catch, contain backstop failure, remove successful CLI/
   run-step/tool writers, and run cross-plan serialization.
8. **PRF-007 enabled transition serialization (B-014, B-015).** Independent of
   6–7 after the 1–5 checkpoint. RED shared lock mechanics, enabled same-entity
   races, and OFF/context-free/config-failure bypass. Add the shared lock owner;
   lock only update read→write→decision and release before capture.
9. **CDX-002 dedicated regression (B-019).** Depends on 6. Add persisted graph
   resume with unavailable frozen worker, remaining tasks, inline subagent,
   fallback execution, spec omission, and no stale-source episode; demonstrate
   failure against pre-CDX-002 behavior.
10. **OFF-state and integration gate (B-001, B-021).** Extend exact disabled
    assertions across 1–9, including CDX-001 layout/output and manager lock bypass.
    Run `bun run test`, `bun run lint`, `bun run typecheck`, and verify all 25
    markers. Any OFF mismatch, terminal-order failure, hook reclassification,
    random synthetic id, or duplicate/missing terminal blocks completion.
