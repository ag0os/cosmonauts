---
title: Episodic-log detached-terminal & resume hardening
status: completed
createdAt: '2026-07-21T22:17:10.000Z'
updatedAt: '2026-07-25T01:01:11.749Z'
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

- **D-002 — Persist a two-phase attempt-terminal ledger: intent, then confirmation** *(amended 2026-07-22 after review — PR-001)*
  - Decision: `run.terminal-episodes/` holds one record per attempt with a `state` of `intended` or `recorded`. A terminal writer persists the **intent** — attempt id, outcome, and the exact episode timestamp — *before* calling `recordEpisode`, then rewrites the same record to `recorded` after success. Every normal, thrown, abort, settle, and resume terminal path reads it: a `recorded` record skips capture outright; an `intended` record means "this attempt's terminal is already owned, and here is the exact content it must have", so a retry or a later resume replays capture from the persisted intent rather than synthesizing fresh content.
  - Alternatives: **write-only-after-success (the previous form of this decision — rejected)**; control-flow convergence (disproved by PRF-002/003/F-005); an in-memory set (not restart-safe); a second terminal episode on reconciliation (violates D-009).
  - Why: write-after-success is not reconstructible. `recordDriveThrownTerminalEpisode` passes **no** timestamp, so `recordEpisode` stamps wall-clock into both the rendered bytes and the filename hash (`lib/memory/episode.ts`, `lib/memory/markdown-store.ts`). If the process dies after the `failed` episode lands but before its marker, a later resume sees no marker and writes an `aborted` terminal whose outcome *and* timestamp differ — so PRF-001's identical-content dedupe cannot collapse them, and the exact `failed`+`aborted` pair this plan exists to eliminate reappears. Persisting the intent first makes the interrupted window reconstructible: the replay regenerates byte-identical content and converges through the store dedupe.
  - Retryability is preserved, which was write-after-success's whole rationale: an `intended` record does not mean "done", it means "owned with this content". Capture failure leaves the intent in place and the next attempt retries it verbatim.
  - Decided by: ratified pre-existing plan direction, claim protocol corrected by plan review PR-001.

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

- **D-005 — A completion-backed terminal-only resume prepares identity even when graph resume state exists** *(added 2026-07-23 after implementation review — UR-001)*
  - Decision: gate-ON terminal-only identity preparation runs when `remainingTaskIds` is empty and *either* there is no graph resume state *or* `run.completion.json` already exists. `reconcilePriorAttempt` gains the same graph-state awareness, so an empty legacy queue with pending graph steps is treated as execution rather than reconciliation. SEQ-003's original spelling is superseded.
  - Alternatives: keep SEQ-003 as written (rejected — it makes F-005 unreachable in production, see below); drop the graph-state condition entirely (rejected — it would prepare identity for resumes the CLI later refuses, breaking SEQ-003's byte-unchanged guarantee for `dirty_worktree`/unsupported-backend); decide reconcile-vs-execute from the legacy queue alone (rejected — it lets a non-worker frozen source attribute an executing resume, violating D-003).
  - Why: SEQ-003's *mechanism* was stricter than the *intent* it stated. `hasGraphResumeState` returns true whenever the run has any graph steps, and every real Drive run is graph-backed, so the original precondition excluded exactly the case F-005 exists to fix. B-011/B-012 still passed because their fixtures carry no durable graph run — the criterion was proven only where it was never in doubt. Requiring a persisted completion keeps the refusal-path guarantee intact (a refused resume has no completion) while restoring F-005 for real completed runs.
  - Consequence: AC-005 is now reachable on production graph-backed runs. B-011/B-012 keep their existing evidence; a completed graph-backed fixture is the coverage gap this decision exposes and should be added.
  - Decided by: implementation review (Quality Manager UR-001, corroborated by the independent codex review), human-approved 2026-07-23.

- **D-010 — AC-001's OFF byte identity excludes the plan-lock-release-failure path** *(added 2026-07-24 after implementation review — TASK-499)*
  - Decision: with the gate OFF, a *failing* plan-lock release may diverge from current `main`. `runInline` and `run-step` install `onTerminalPersisted` and the swallowing release backstop unconditionally, so when release rejects, Drive resolves with the authoritative persisted result and appends one `terminal_persisted_hook_failed` diagnostic, where `main` rejects the handle and writes no diagnostic. Every OFF path that does **not** hit a release failure remains byte-identical to `main`, and that remains a hard gate. B-023 wins the conflict.
  - Alternatives: install the hook and swallowing backstop only for identity-bearing runs, restoring exact OFF parity (rejected — it reinstates `main`'s worse semantics, where a Drive run that fully succeeded is reported as failed because post-run lock cleanup failed, and it adds a second untested code path in both `driver.ts` and `run-step.ts`); suppress only the OFF diagnostic to restore event-byte identity while keeping result preservation (rejected — a half-measure that satisfies neither criterion cleanly and still violates AC-001's rejection semantics).
  - Why: AC-001 and B-023 are mutually exclusive on exactly this path. AC-001 was written to catch enabled-path *wiring* leaking into OFF layout — the CDX-001 lesson — not to preserve a failure semantic that is itself undesirable. The divergence is a failure-of-a-failure: it requires the plan lock's unlink to fail (for example `EIO`) after a run has already persisted its completion. In that window the new behavior is strictly more useful, because cleanup failure no longer masquerades as run failure.
  - Consequence: AC-001 and B-001 are narrowed in text to name this exclusion; no code changes. This is a *named* narrowing, not silent drift — the same treatment as SF-001. Any OFF divergence on a non-failure path remains a hard failure. TASK-499 is closed by this decision rather than by an implementation.
  - Decided by: human, 2026-07-24, on the round-2 codex finding and the plan-review characterization.

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

`spec.md` now carries native `AC-001`–`AC-009` identifiers on its Acceptance
Criteria *(Added 2026-07-22 after review — PR-005)*. Behavior `Source` fields
cite those IDs directly, so traceability no longer depends on bullet position
and survives spec edits. Criteria are never renumbered; new ones append.

### B-001 - OFF-state bytes and presentation remain identical

- Source: AC-001
- Context: `episodicLog.enabled` is absent or false across inline, detached, abort, resume, CLI/tool, and plan/task update paths touched by this plan
- Action: those paths execute with the hardening present
- Expected: session and manifest paths, serialized specs/results/completions, workdir file layout, legacy/normalized event order, CLI/tool output text, and sequential plan/task bytes equal current `main`; managers do not enter the new entity lock, so concurrent OFF updates retain current unlocked semantics; no terminal-ledger, update-lock, or memory episode artifact remains. **Excluded by D-010** *(added 2026-07-24)*: a failing plan-lock release, where OFF now resolves with the persisted result plus one `terminal_persisted_hook_failed` diagnostic instead of rejecting. Every OFF path that does not hit a release failure stays byte-identical, and divergence there remains a hard failure
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
- Expected: the "Fresh-Process Wake And Drive Reconstruction" section gains a paragraph stating that off-then-enabled terminal-only resume derives and persists a deterministic run-id attempt id when a source resolves, records one terminal, dedupes repeated resumes, and warns/skips capture honestly when source resolution fails; the existing unqualified claim that "resume surfaces have terminal evidence" is qualified to match. The `launchDetached` hard-kill residual sentence and the launch-resolution warn/skip sentence stay unchanged — this edit is additive plus one qualification, and removes nothing *(revised 2026-07-22 after review — SF-004/CF-006: the prior wording asserted removal of an "unconditional skip" sentence that does not exist in the file)*
- Seam: `docs/memory.md`
- Test: `tests/memory/interface.test.ts` > `documents deterministic off-then-enabled terminal-only resume`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-013`

### B-014 - Concurrent enabled plan updates count actual persisted transitions

- Source: AC-006
- Context: two episode-producing sessions in an enabled project update one plan status concurrently, including same-target and different-target cases
- Action: each `PlanManager.updatePlan` runs under the same per-plan file lock and captures after release
- Expected: each writer reads the status produced by the prior serialized writer; episode count and previous→current details equal actual persisted transitions, with no episode for a same-status write. The guarantee is bounded to *episode-producing* writers (see the SF-001 residual in Design 7); a context-free concurrent writer is explicitly out of scope. The lock file lives flat under `.cosmonauts/` and never inside `missions/`
- Seam: `lib/plans/plan-manager.ts` through `lib/memory/episode-transition-lock.ts`
- Test: `tests/plans/plan-manager.test.ts` > `serializes enabled same-plan status transition decisions across manager instances`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-014`

### B-015 - Concurrent enabled task updates count actual persisted transitions

- Source: AC-006
- Context: two episode-producing sessions in an enabled project update one task status concurrently, including a status-driven filename change
- Action: each `TaskManager.updateTask` runs under the same per-task file lock and captures after release
- Expected: read, old filename selection, merge, write/rename, and transition decision share one critical section; episode count and details equal actual transitions, with no lost/duplicate task file. Concurrent updates spelled `TASK-001` and `task-001` take the **same** lock, because the path derives from the canonical uppercased id; the guarantee is bounded to episode-producing writers as in B-014
- Seam: `lib/tasks/task-manager.ts` through `lib/memory/episode-transition-lock.ts`
- Test: `tests/tasks/task-manager-concurrency.test.ts` > `serializes enabled same-task updates and records only actual status transitions`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-015`
- Additional evidence: `readdir("missions/tasks")` contains no non-`.md` entry during or after a locked update, and `git status --porcelain` is unchanged — the lock must not be archivable by `lib/plans/archive.ts`'s unfiltered task-id prefix match

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
- Context: B-001 through B-020 and B-022 through B-029 are integrated as one change set
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

*Behaviors B-026 through B-029 were added 2026-07-22 after the two review
channels; see the Decision Log amendments and Design 2, 3, 4, 6, and 7.*

### B-026 - An interrupted terminal capture cannot become a duplicate pair

- Source: AC-003
- Context: an enabled attempt records its thrown `failed` episode successfully, then the process dies before the ledger record reaches `state: "recorded"`
- Action: a later settle or resume reads the persisted `intended` record
- Expected: it replays the terminal from the record's persisted `outcome` and `timestamp`, producing byte-identical episode content that the store dedupes, and never writes a divergent `aborted` terminal; the attempt still holds exactly one terminal episode
- Seam: two-phase claim in `lib/driver/run-state.ts` and `lib/driver/drive-graph-runner.ts`
- Test: `tests/driver/drive-on-graph-recovery.test.ts` > `replays an intended terminal record instead of writing a second outcome`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-026`

### B-027 - A drained bridge always reaches stopped

- Source: AC-002
- Context: an enabled bridge has published a terminal and entered `draining`, and the detached result then rejects (child dies before completion lands, or a non-ENOENT completion read failure), or no caller ever calls `finish()`
- Action: the parent settles, or the bridge's internal drain deadline expires
- Expected: the bridge reaches `stopped` with no live file/directory watcher and no live interval, via the caller's `try/finally` `finish()` on both resolve and reject *and* independently via its own deadline; `stop()` and `finish()` remain mutually idempotent
- Seam: drain deadline in `lib/driver/event-stream.ts`; unconditional shutdown in `startDetachedProcess` in `lib/driver/driver.ts`
- Test: `tests/driver/driver-detached.test.ts` > `stops a draining bridge when the detached result rejects`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-027`

### B-028 - Abort leaves no bridge published in the launch window

- Source: AC-004
- Context: `handle.abort()` runs between `setChild` and `setBridge` during detached launch
- Action: abort sets `aborted`, yields, and re-reads the entire live launch state
- Expected: no bridge is published, or a published bridge is stopped immediately; the pid-file write and bridge construction are skipped after an observed abort; no watcher or timer survives
- Seam: `DetachedLaunchState.aborted` and `launchDetachedProcess` in `lib/driver/driver.ts`
- Test: `tests/driver/driver.test.ts` > `stops a bridge published during the abort window`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-028`

### B-029 - A rejected plan-lock release stays retryable

- Source: AC-007
- Context: the first `LockHandle.release()` rejects (read or unlink failure) and the caller's `.finally` backstop then runs
- Action: the backstop calls `release()` again
- Expected: the second call genuinely retries and removes the lock rather than returning early; the handle marks itself released only after a successful unlink or after confirming the lock is not ours; ordinary success-path release remains idempotent with no second unlink, and no plan lock is left held by a live process
- Seam: `createHandle` in `lib/driver/lock.ts`
- Test: `tests/driver/lock.test.ts` > `retries release after a failed unlink and stays idempotent on success`
- Marker: `@cosmo-behavior plan:episodic-log-detached-hardening#B-029`

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
readDriveTerminalRecord(
  workdir: string,
  attemptId: string,
): Promise<DriveTerminalRecord | undefined>
writeDriveTerminalRecord(
  workdir: string,
  record: DriveTerminalRecord,
): Promise<void>
```

```ts
interface DriveTerminalRecord {
  version: 1;
  attemptId: string;
  outcome: DriverResult["outcome"];
  /** The exact episode timestamp; replay must reproduce it verbatim. */
  timestamp: string;
  state: "intended" | "recorded";
}
```

The record path is `run.terminal-episodes/<sha256(attemptId)>.json`; hashing
prevents path traversal and target-project filename variance. Bytes are
deterministic given `(attemptId, outcome, timestamp, state)` — no mtime, no
random value, no wall clock beyond the persisted episode timestamp itself — so
redundant writes at the same state converge byte-for-byte. Reads validate
content and treat a malformed or partially written record as absent. The
directory is created only on an identity-bearing terminal path; OFF runs never
touch it.

Terminal capture (normal and thrown) is a two-phase claim:

1. derive the complete frozen identity;
2. read the persisted record;
3. `state === "recorded"` → skip entirely;
4. `state === "intended"` → **replay**: rebuild the episode from the persisted
   `outcome` and `timestamp` rather than synthesizing new content;
5. no record → resolve the episode timestamp *once* (completion-backed paths use
   `result.completedAt`; the thrown path resolves its wall clock here and nowhere
   else), then persist `state: "intended"`;
6. call `recordEpisode` with that exact timestamp;
7. rewrite the same record to `state: "recorded"` on success.

This closes PR-001's interrupted window. Because the thrown path's timestamp is
persisted at step 5 instead of being generated inside `recordEpisode`, a crash
between steps 6 and 7 leaves an `intended` record that any later settle or
resume replays into byte-identical episode content — which PRF-001's store
dedupe collapses — instead of a divergent `aborted` terminal. An `intended`
record also blocks a *different* outcome from claiming the attempt: settle and
resume treat `intended` as owned.

Ledger read/write failure stays non-load-bearing and reports through the
existing `episode_capture_failed` reporter. A failed intent write means capture
proceeds unclaimed exactly as today (no regression versus current `main`), and a
failed capture leaves the intent in place for verbatim retry. PRF-001 store
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

**`draining` must be self-terminating** *(added 2026-07-22 after review —
DA-001)*. Today the bridge's only self-stop is the terminal event itself
(`event-stream.ts:591-594`), and that `stop()` is the sole thing that ever clears
the `retryInterval` installed at `event-stream.ts:661`. Replacing that self-stop
with a state whose only exit is an external `finish()` would leak watchers and a
live `setInterval` for the parent's whole lifetime on every path where nobody
calls `finish()`. Two defenses, both required:

1. **Internal deadline.** Entering `draining` arms a bridge-owned timer; on
   expiry the bridge performs its final poll and reaches `stopped` on its own,
   with no external call. The bridge is never dependent on a caller for
   liveness.
2. **Unconditional caller shutdown.** `startDetachedProcess` wraps
   `waitForDetachedResult` in `try/finally` so `await bridge.finish()` runs on
   **rejection** as well as resolution, and on the `launchDetachedProcess` throw
   path.

The reject path is not hypothetical: a child that emits `run_completed` and then
dies before `writeRunCompletion` lands makes `waitForUnexpectedExit`
(`driver.ts:592-609`) reject 500 ms later, and `startDetached`'s only `.finally`
merely removes the pid file. On the long-lived `run_driver` tool host that leak
would persist for the entire Pi session. A non-ENOENT read failure in
`waitForCompletion` (`driver.ts:578-581`) has the same shape.

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
  /** Set by abort() before it yields; publishers must honour it. */
  aborted: boolean;
}
```

Launch callbacks mutate it; abort receives the object, not snapshots. Abort
hard-stops the current bridge, sets `aborted`, calls `controller.abort()`, yields
one microtask so a synchronous spawn already in progress can publish its child,
then **re-reads the entire live state — not just `child`**. If a child exists,
abort terminates and awaits it. Only afterward does it re-read `workdirCreated`,
inspect guarded completion, and reconcile the ledger.

**Publication after abort must not resurrect a bridge** *(added 2026-07-22 after
review — DA-005/CF-001)*. In `launchDetachedProcess` the bridge is published
*after* the child and after the pid-file write, so an abort landing between
`setChild` and `setBridge` would otherwise install a fresh bridge that nothing
ever stops — the same watcher/timer leak as DA-001, reached by a different route.
Therefore: `setBridge` stops the bridge immediately (or declines to publish) when
`aborted` is set; `launchDetachedProcess` re-checks the abort signal after the
spawn so the pid-file write and bridge construction are skipped; and abort's
post-yield re-read stops any bridge that appeared regardless.

Two deterministic race tests, both mocking rather than sleeping — no
production-only sleep or random stress loop is acceptable:

1. `spawn` mocked so `handle.abort()` runs inside the last-check→child-publication
   window (asserts no live child).
2. the pid-file write or bridge factory mocked so `handle.abort()` runs between
   `setChild` and `setBridge` (asserts no live bridge watcher or timer).

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

**The backstop only works if `release()` is actually retryable** *(added
2026-07-22 after review — PR-002)*. `createHandle` in `lib/driver/lock.ts`
currently sets `released = true` **before** it reads the lock file and unlinks
it, so if either operation rejects, every later call returns immediately without
retrying. The advertised "`.finally` backstop" would then be a no-op and the
lock file would stay on disk owned by a still-live PID — and on the long-lived
`run_driver` tool host, later same-plan runs are reported as active until that
process exits, even though the primary result already returned successfully.
That makes the hook strictly worse than today's release-in-`.finally`, which is
the opposite of PRF-004's intent.

Fix the contract at the source: `release()` marks itself released only after the
unlink succeeds *or* after it confirms the lock is not ours; a rejected release
leaves the handle retryable so the `.finally` backstop can genuinely retry.
`lib/driver/lock.ts` joins Files to Change. This is a real behavior change to a
shared primitive, so it carries its own behavior and its own OFF-state evidence:
release remains idempotent for the ordinary success path, and no caller may
observe a second unlink.

All primary git operations, durable run/step writes, terminal legacy emission,
and completion persistence precede the hook. Post-hook capture may write the
episode and, on failure, its exact `episode_capture_failed` diagnostic; this
narrow diagnostic is intentionally allowed and is the payload the bridge drain
exists to deliver. The cross-plan repo-commit suite guards primary serialization.

### 7. Enabled per-entity status-transition serialization

Create `lib/memory/episode-transition-lock.ts` as the gate/context decision
owner — **not** as a new lock protocol:

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
Only literal enabled acquires a lock.

**Reuse the existing primitive; do not write a third one** *(added 2026-07-22
after review — CF-003/PR-004)*. `lib/tasks/lock.ts` already implements exactly
the described protocol (exclusive creation, waiting, PID+nonce ownership,
stale-owner recovery, owner-checked idempotent release) and documents that it was
itself copied from `lib/driver/lock.ts`. Generalize it into a path-parameterized
`withEntityFileLock(lockPath, fn)`, keep `withTaskCreateLock` as a thin caller,
and have `episode-transition-lock.ts` own only the gate/context decision and
delegate acquisition. A third independent copy of stale/release semantics is
exactly where PR-002 found a lifecycle defect in the second.

**Lock file placement is `.cosmonauts/`, flat — never colocated** *(added
2026-07-22 after review — CF-002/DA-004)*:

- `.cosmonauts/episode-plan-<slug>.lock`
- `.cosmonauts/episode-task-<canonical-id>.lock`

"Colocated but not markdown-scanned" is unsafe for tasks.
`lib/plans/archive.ts:103-105` does an **unfiltered** `readdir(tasksDir)` and
selects the task file with `taskFiles.find((f) => f.startsWith(task.id))`, so a
`missions/tasks/TASK-123*.lock` can be selected instead of `TASK-123-*.md` —
archiving would move the lock and silently orphan the real task file. Design §7
also mandates stale-owner recovery, meaning a crashed holder's lock file
*persists* until the next acquisition, so this is reachable by design rather than
only by a race. `lib/tasks/lock.ts:26-33` already documents the opposite
convention verbatim; follow it.

Placement must be **flat** inside `.cosmonauts/`: the ignore rule at
`.gitignore:21` is `.cosmonauts/*.lock`, a single-level glob, so a `locks/`
subdirectory would leave the files git-visible and trip Drive's own
dirty-worktree resume refusal (`refuseDirtyResume`).

**Canonical entity identity** *(added 2026-07-22 after review — PR-003)*: task
IDs are deliberately case-insensitive — `findTaskFilenameById` uppercases, and
the existing suite proves `task-001`, `TASK-001`, and `Task-001` are one task.
The lock path must therefore derive from the **canonical** (uppercased) task id,
or two writers on the same record would take different locks and defeat B-015
entirely. Plan slugs use their existing canonical form. The B-015 test includes
mixed-case concurrent updates.

**Acquisition is fail-soft and bounded** *(added 2026-07-22 after review —
DA-003)*: this helper sits on the *primary* write path, so it must never
strengthen a fail-soft subsystem into a load-bearing one — that would contradict
D-008. On acquisition error, or after a bounded wait, it reports once through the
established episode-warning channel and runs `action()` **unlocked** rather than
throwing or waiting forever. An unwritable or held lock path degrades episode
counting; it never fails or stalls a plan/task update.

Plan/task managers call this helper around the authoritative read, not-found
check, old filename (for tasks), merge, primary write/rename, optional plan spec
write, and previous/current status decision. The helper releases in `finally`;
only then does existing fail-soft episode capture run. Locks leave no final
artifact. No in-memory mutex participates. `createPlan`, `createTask`,
delete/archive, context-free Drive managers, gate-OFF updates, and unrelated
mutation paths are unchanged.

**Named accepted residual** *(added 2026-07-22 after review — SF-001)*: gating
on `hasEpisodeContext` means an episode-context writer racing a *context-free*
writer (notably Drive's own managers) is not serialized, so AC-006's guarantee
covers episode-producing writers only. This is accepted rather than fixed:
Drive-internal transitions are capture-suppressed by construction under D-006,
and widening the lock to every writer enlarges the blast radius well past the
spec's "episode-counting correctness only" scope. B-014/B-015 state this bound
explicitly rather than implying full mutual exclusion.

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
- **New:** `lib/memory/episode-transition-lock.ts` — enabled/context-aware gate selection **only**, plus fail-soft bounded-wait degradation; delegates all acquisition to the generalized primitive below. Depends on neither plan nor task modules.
- **New:** `tests/memory/episode-transition-lock.test.ts` — enabled acquisition/wait/stale cleanup/owner release, absent/false/context-free/config-failure bypass, and fail-soft degradation to an unlocked action on acquisition error or wait timeout.
- `lib/tasks/lock.ts` — generalize into a path-parameterized `withEntityFileLock(lockPath, fn)`; `withTaskCreateLock` becomes a thin caller. No third copy of the lock protocol is created. Tests: existing task-lock suite plus the new entity-lock cases.
- `lib/driver/lock.ts` — **(added after review, PR-002)** `createHandle` marks released only after a successful unlink or a confirmed not-ours check, so a rejected release stays retryable and the `.finally` backstop is real. Test: `tests/driver/lock.test.ts`.
- `lib/plans/plan-manager.ts` — derive per-plan lock path under `.cosmonauts/` (flat); run update read→write→decision through shared helper; release before capture. Test: `tests/plans/plan-manager.test.ts`.
- `lib/tasks/task-manager.ts` — derive per-task lock path from the **canonical uppercased** id under `.cosmonauts/` (flat); run update read/rename/write→decision through shared helper; release before capture. Tests: `tests/tasks/{task-manager,task-manager-concurrency}.test.ts`.
- `tests/plans/archive.test.ts` — attach B-015 evidence that `missions/tasks/` holds no non-`.md` entry during a locked update, so `lib/plans/archive.ts`'s unfiltered task-id prefix match cannot archive a lock file. Production `archive.ts` is unchanged.
- `docs/memory.md` — reconcile fresh-process reconstruction with deterministic terminal-only resume and resolution-failure behavior. Test: `tests/memory/interface.test.ts`.
- `tests/driver/backends/cosmonauts-subagent-resolution.test.ts` — retain CDX-001 exact plain-`worker` role/session-layout regression; production backend code is unchanged.
- `tests/extensions/orchestration-driver-detached.test.ts` — retain/extend absent/false detached spec and output parity.
- `tests/driver/cross-plan-commit-lock.test.ts` — attach B-018 evidence; production repo-commit lock is unchanged.

`memory/episodic-log.md` remains historical shipped-plan memory and is not
rewritten. No config loader, memory-store schema, episode serializer, agent-memory
extension, architecture-map, or gate default changes.

## Risks

- **Drain liveness and late bytes:** `finish()` must serialize a final read before
  cleanup; the 2 s child-exit bound must be fake-timer tested. The bridge's own
  drain deadline and the caller's `try/finally` shutdown are **both** required —
  neither alone is sufficient, because the reject path has no caller today and a
  caller-only design leaks a `setInterval` for the parent's lifetime. If leak-free
  cleanup cannot be proven on the reject path, stop and revise the bridge API.
- **Ledger claim race:** two truly concurrent writers could both pass a
  pre-check. The two-phase intent narrows this to the window between reading "no
  record" and writing the intent; current paths also serialize through child
  exit/settle. *(Corrected 2026-07-24 after round-3 review.)* The original note
  claimed "identical races dedupe in the store", but two concurrent first-time
  terminal-only resumes of one run produce the **same** outcome with
  **different** timestamps — each stamps its own `completedAt` — and timestamp
  participates in episode content and filename hashing, so they do **not**
  dedupe. That is a reachable double-terminal violating D-002. The fix makes the
  intent write an **exclusive** claim (`claimDriveTerminalIntent`: temp file +
  `link`, EEXIST → read winner): only one writer creates the record, and the
  loser replays the winner's persisted outcome and timestamp, so the two
  captures are byte-identical and the store collapses them to one. A reachable
  *different-outcome* race surviving the exclusive intent write remains a
  stop-and-redesign condition rather than a reason to weaken exactly-once.
- **Fail-soft that becomes load-bearing:** the transition lock sits on the
  primary write path. Any design in which a lock error or a slow holder can fail
  or stall a plan/task update violates D-008 and is a stop condition — degrade to
  unlocked-with-warning instead.
- **Shared-primitive blast radius:** `lib/driver/lock.ts` and `lib/tasks/lock.ts`
  are used well beyond this plan. Their changes need their own OFF-state evidence;
  a release-semantics regression there is far worse than the defects being fixed.
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
| 1 | `correctness` | universal | bound | Current 2,645-test baseline plus all B-001–B-029 regressions passes; lint and type checks are clean | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every behavior has required fields, a root-relative evidence file, and exactly one matching marker near its executable test | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Negatives kill terminal reordering, random F-005 ids, intent-skipped capture, stale launch snapshots, bridge over-forwarding, an unstoppable drain, stamped downgrade, hook-rejection reclassification, post-hook caller writes, failed-resolution fallthrough, non-worker trust, stale manager reads, raw-case lock ids, OFF lock acquisition, and OFF-layout leakage | pending | unbound; targeted tests plus reviewer judgment required |
| 4 | `duplication` | bindable | unbound | One terminal ledger, fallback guard, bridge drain, and terminal helper exist, and the count of filesystem lock-protocol implementations in the repo does **not** increase | pending | unbound; reviewer judgment required |
| 5 | `boundary-conformance` | bindable | bound | Gate remains OFF; run-state owns terminal persistence; hook failure cannot create a terminal; enabled entity locks release before capture and degrade fail-soft; no lock or ledger artifact lands in a scanned or git-tracked directory; no architecture/MemoryStore surface widens | project-discovered | hard fail through exact tests and source review |

*Rows 4 and 5 were swapped 2026-07-22 after review (PR-006): the canonical
ladder orders `duplication` before `boundary-conformance` when both apply.*

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

1. **Attempt-terminal ledger (B-022, B-026 foundation).** RED record
   path/content, fresh-process read, the two-phase intent→recorded claim, replay
   of an `intended` record, and fail-soft error behavior. The thrown path must
   resolve its episode timestamp once, at intent time, and pass it explicitly to
   `recordEpisode` — never let `recordEpisode` stamp wall-clock for a terminal.
   Wire all terminal builders through it without changing order. This establishes
   the shared D-009 completion/outcome contract.
2. **PRF-003 thrown/settle/resume (B-006, B-007, B-010).** Depends on 1. RED
   failed→settle and failed→fresh-resume. Add stamped fallback guard, route CLI/
   tool fallback writers through it, and remove successful tool rewriting.
3. **PRF-002 live abort state (B-008, B-009, B-028).** Depends on 1–2. Replace
   snapshots, add the `aborted` flag, add both deterministic mocked races
   (spawn window and `setChild`→`setBridge` window), terminate/await before
   completion reconciliation, and reuse ledger/guard.
4. **F-003/UR-002 bridge drain (B-002–B-005, B-027).** Depends on 1–3 and never
   reorders them. RED allowlist, final poll, timeout, abort stop, parent bus, and
   terminal-before-completion; implement `finish()`, the enabled-only drain, the
   bridge-internal drain deadline, and unconditional `try/finally` shutdown on
   the reject path.
5. **F-005 deterministic terminal-only identity (B-011–B-013, B-025).** Depends
   on 1–4. RED successful off-then-enabled, repeat resume, and runtime/source
   failure before `prepareResume`; derive/persist run-id identity, reuse ledger,
   and reconcile docs. **Precondition (SEQ-003, amended 2026-07-23 after
   implementation review — see D-005):** the identity-preparation helper runs
   only when the resume will actually terminate inside `prepareResume` — empty
   `remainingTaskIds`, **and** either no graph resume state **or** an existing
   `run.completion.json`. The original spelling of this precondition was "empty
   `remainingTaskIds` **and** no graph resume state"; that is stricter than the
   intent it states and is superseded by D-005. A resume the CLI subsequently
   refuses (`dirty_worktree`, unsupported backend) must still leave `spec.json`
   and `task-queue.txt` byte-unchanged. Add that refusal case as evidence.
   **Stages 1–5 form one atomic delivery checkpoint and must ship together**; no
   subset is mergeable because all share D-009 ownership.
6. **SR-001 execution guard (B-020).** Depends on 5. RED executing non-worker and
   reconcile provenance; enforce exact `agentId === "worker"` only on execution.
7. **PRF-004 terminal hook (B-016–B-018, B-023, B-024, B-029).** Depends on
   stable 1–5. **Fix `lib/driver/lock.ts` release retryability FIRST** — the
   hook's entire safety story rests on the `.finally` backstop being real, and
   today a rejected release permanently disables it. Then RED hook order and
   rejection for all completion-backed outcomes. Isolate rejection from broad
   catch, contain backstop failure, remove successful CLI/run-step/tool writers,
   and run cross-plan serialization.
8. **PRF-007 enabled transition serialization (B-014, B-015).** Independent of
   6–7 after the 1–5 checkpoint. First generalize `lib/tasks/lock.ts` into the
   path-parameterized primitive — do not author a new lock protocol. Then RED
   enabled same-entity races (including mixed-case task ids), OFF/context-free/
   config-failure bypass, fail-soft degradation on acquisition failure, and
   `.cosmonauts/`-flat placement with no `missions/` or git-visible residue.
   Lock only update read→write→decision and release before capture.
9. **CDX-002 dedicated regression (B-019).** Depends on 6. Add persisted graph
   resume with unavailable frozen worker, remaining tasks, inline subagent,
   fallback execution, spec omission, and no stale-source episode; demonstrate
   failure against pre-CDX-002 behavior.
10. **OFF-state and integration gate (B-001, B-021).** Extend exact disabled
    assertions across 1–9, including CDX-001 layout/output and manager lock bypass.
    Run `bun run test`, `bun run lint`, `bun run typecheck`, and verify all 29
    markers. Any OFF mismatch, terminal-order failure, hook reclassification,
    random synthetic id, duplicate/missing terminal, leaked bridge watcher or
    timer, or lock/ledger artifact in a scanned or git-tracked directory blocks
    completion.
