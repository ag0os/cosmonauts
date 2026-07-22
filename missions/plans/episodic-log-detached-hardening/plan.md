---
title: Episodic-log detached-terminal & resume hardening
status: active
createdAt: '2026-07-21T22:17:10.000Z'
updatedAt: '2026-07-22T14:22:22.000Z'
---

## Overview

Correctness hardening for the *enabled* episodic-log Drive path: fix the seven
detached-terminal/resume edge defects deliberately deferred out of the shipped
`episodic-log` plan (agent-memory W3), plus one test-debt item. For the human
running enabled detached Drive runs, terminals become exactly-once and honestly
attributed; for `memory-consolidation` (W4), the episodic store it will consume
stops accumulating duplicate, missing, or misattributed terminals. The gate stays
off by default, so a default install is unaffected — and OFF-state byte-identity
is an explicit acceptance gate, not an assumption.

See `spec.md` for the product-side statement of each finding. Evidence of record
is `missions/archive/plans/episodic-log/qm-review.md`; findings were not
re-verified from scratch, but every seam named below was read at design time.

## Current State

The terminal path is the same in all three drivers. `runDriveOnGraph`
(`lib/driver/drive-graph-runner.ts:176-186`) does, in order:

1. `stampDriveEpisodeResult` — stamps `completedAt` **only** when the launch
   froze a complete episode identity (this is what keeps OFF-state bytes intact).
2. `emitTerminalLegacyEvent` — `run_completed` to JSONL + bus.
3. `writeRunCompletion` — `run.completion.json`.
4. `recordDriveTerminalEpisode` — episode capture; on failure the reporter
   (`createDriveEpisodeWarningReporter`) emits an `episode_capture_failed`
   `driver_diagnostic` through the same sink.

Callers around it:

- `runInline` (`lib/driver/driver.ts:99`) holds the plan lock across the whole
  call, releasing in `.finally` — i.e. across step 4. `run-step.ts:88` (the
  detached child) does the same.
- `startDetached` (`driver.ts:136`) tracks `child`/`bridge`/`workdirCreated` in
  closure `let`s and hands them **by value** into `abortDetachedRun`.
- `bridgeJsonlToActivityBus` (`lib/driver/event-stream.ts:591`) calls `stop()`
  the instant it bridges a terminal event, so the step-4 diagnostic — written to
  the child JSONL *after* the terminal event — never reaches the parent bus.
- `runDriveOnGraph`'s catch records a `failed` terminal at wall-clock and writes
  **no** completion; `runInlineMode` (`cli/drive/subcommand.ts:511`) then writes
  an *unstamped* `aborted` completion, which a later `--resume` stamps and
  re-records via `persistResumeTerminal` (`subcommand.ts:1589`) — two terminals,
  one attempt.
- Terminal-only resume with no frozen `episodeAttemptId` yields
  `episodeIdentity === undefined` (`subcommand.ts:338`) — no terminal at all.
- `PlanManager.updatePlan` / `TaskManager.updateTask` decide "did status change?"
  from a read that is not serialized with their own write.

`LockHandle.release()` is already idempotent (`lib/driver/lock.ts:213`) and
`stampDriverResult` already preserves an existing `completedAt`
(`lib/driver/types.ts:307`) — both are load-bearing for the design below.

## Design

### 1. The ordering constraint, resolved without reordering

The three wants form a genuine cycle: capture-diagnostic **before** terminal
event (B-026, for the bridge), terminal event **before** completion file
(inline consumers), completion file **before** capture (D-009, identity is
content-derived). The reverted F-003 patch proved you cannot break it by
permuting steps 2–4.

**Decision: a post-terminal drain in the bridge, not a reorder.** Steps 1–4 stay
exactly as they are. `bridgeJsonlToActivityBus` gains a `draining` state: on a
terminal event it stops forwarding the general stream (preserving today's
"nothing after the terminal" guarantee for every other event type) but keeps
tailing, forwarding **only** `driver_diagnostic` events whose `code` is
`episode_capture_failed`. `startDetached` closes the drain — `bridge.finish()`
after the child exits, with a bounded fallback timeout so a wedged child cannot
hold the bridge open; `bridge.stop()` stays a hard, immediate stop for the abort
path.

This is strictly additive to the parent bus (one narrowly allowlisted event
type), needs no change to the child, and leaves the inline happy-path ordering
suite untouched — which is the suite the reverted attempt broke. The alternative
(two-phase completion marker) was rejected: it changes the observable completion
contract for every consumer to fix a failure-of-a-failure path.

### 2. The attempt-terminal ledger — one mechanism, three findings

D-009's "exactly one terminal per attempt" is today an emergent property of
control flow, which is why it breaks whenever control flow forks (thrown exit,
abort, resume). Make it a mechanism instead.

A per-attempt marker directory in the run workdir, `run.terminal-episodes/`,
holds one file per attempt id. `recordDriveTerminalEpisode` checks for the
attempt's marker before capturing and writes it **after** a successful capture.
Write-after-success (not claim-before) is deliberate: a failed capture must stay
retryable, and the truly-concurrent identical-content case is already covered by
PRF-001's store-level dedupe. The marker only exists when an episode identity
exists, so the OFF path never creates one — OFF-state bytes are unchanged by
construction.

This single mechanism closes:

- **PRF-003** — the thrown path's `failed` terminal is recorded and marked; the
  settle/resume `aborted` write finds the marker and skips. First terminal wins,
  which is the honest one (the attempt did fail).
- **PRF-002 (resume-duplicate leg)** — the abort path's terminal and a later
  resume's terminal collapse to one.
- **F-005 (idempotence)** — repeated resumes record nothing new.

PRF-003 also needs a completion-write guard: `runInlineMode`'s catch and the
abort path must never overwrite an existing *stamped* completion with an
unstamped one. Downgrade to "write only if absent or currently unstamped."

### 3. Remaining findings

**PRF-002 (leak leg)** — replace the by-value `child`/`workdirCreated` snapshot
with a live launch-state object shared between `startDetachedProcess` and
`abort()`. After `controller.abort()`, re-read the live state and, if a child
appeared in the pre-spawn window, terminate it. Needs a deterministic window
test (abort injected between the last `throwIfAborted` and `spawn`).

**F-005 (deterministic id)** — settled, not a planner choice. Replace the
`undefined` at `subcommand.ts:338` with a run-id-derived attempt id
(`deriveDriveEpisodeAttemptId(runId)`, a stable hash — **not** `randomUUID`) and
persist it into the resumed spec. Determinism plus `stampDriverResult`'s
`completedAt` preservation makes repeat resumes byte-identical, so the ledger and
PRF-001's content dedupe agree rather than merely coexist. `docs/memory.md`
(§"Fresh-Process Wake And Drive Reconstruction", ~line 383) currently describes
the skip as deliberate and must be reconciled.

**SR-001 residual — decision: yes, guard it.** For an attempt that will
*execute*, only trust a frozen `episodeSource` whose `agentId` is `worker`;
anything else is provenance-only and the attempt mints identity from the actually
resolved worker. Legitimate sources are always `<domain>/worker` (they come from
`resolveDriveEpisodeWorker`'s `coding/worker` role), so the guard costs nothing
on real inputs and closes the whole recorded≠executed class rather than the one
leg CDX-002 patched. Reconcile-only resumes keep the frozen source untouched —
there, provenance of the prior attempt is exactly what is wanted.

**PRF-004 — decision: hook, not a lock move.** Add an optional
`onTerminalPersisted` callback to `RunDriveOnGraphCtx`, invoked once after the
completion write and before episode capture at every terminal site.
`runInline` and `run-step` pass `lock.release` (idempotent, so the existing
`.finally` stays as the backstop). Nothing after the hook touches git, the run
store, or the completion file, so cross-plan commit serialization is unaffected;
the thrown path writes no completion and keeps releasing via `.finally`.

**PRF-007 — decision: scope to episode-counting correctness.** Serialize the
read → decide → write window in `PlanManager.updatePlan` /
`TaskManager.updateTask` with a per-entity file lock, and derive
`previousStatus` from the read taken *inside* that section. Cross-session means
cross-process, so an in-memory mutex is not enough. A lock is not an observable
artifact, so OFF-state files and output stay byte-identical. Fully serializing
every other pre-existing mutation on these managers stays out of scope.

## Implementation Order

1. **Attempt-terminal ledger** — `run.terminal-episodes/` marker read/write in
   `lib/driver/run-state.ts`; `recordDriveTerminalEpisode` consults it. Gate-on
   only.
2. **PRF-003** — thrown-exit / settle / resume reconciliation on the ledger, plus
   the never-downgrade-a-stamped-completion guard. Depends on 1.
3. **PRF-002** — live launch state in `startDetached` / `abortDetachedRun`;
   deterministic pre-spawn-window abort test. Depends on 1 for the duplicate leg.
4. **F-003 / UR-002** — bridge post-terminal drain + `finish()` API +
   `startDetached` wiring; assert the inline happy-path ordering suite stays green.
5. **F-005** — `deriveDriveEpisodeAttemptId`, resume wiring, spec persistence,
   `docs/memory.md` reconciliation. Depends on 1 for the idempotence assertion.
6. **SR-001** — `agentId === "worker"` guard on execution-path frozen sources.
7. **PRF-004** — `onTerminalPersisted` hook; `runInline` and `run-step` release
   the plan lock before episode I/O.
8. **PRF-007** — per-entity serialization of the status transition window in
   `PlanManager` / `TaskManager`.
9. **CDX-002 regression test** — new resume fixture: persisted run, frozen
   `episodeSource` whose worker no longer resolves, non-empty `remainingTaskIds`,
   inline `cosmonauts-subagent`; assert the resumed spec omits
   `episodeSource`/`episodeAttemptId`, the fallback worker executes, and no
   episode names the stale source. Must fail against pre-CDX-002 behavior.
10. **OFF-state byte-identity proof + gates** — extend the disabled-path exact
    (`toEqual`) assertions across every path touched by 1-8; `bun run test`,
    `bun run lint`, `bun run typecheck`.

## Risks

- **The drain window is a new liveness surface.** A child that never exits must
  not hold the bridge open; the bounded fallback timeout is the mitigation and
  needs its own test.
- **Ledger first-write-wins can hide a legitimately different second outcome.**
  Accepted: D-009 says one terminal per attempt, and the first is the honest one.
  Worth a comment at the check site so a future reader does not "fix" it.
- **PRF-004's early release widens the window where another run for the same
  plan can start.** Everything after the hook is store-local episode I/O, but the
  existing cross-plan serialization suites are the guard — treat a failure there
  as a design error, not a flaky test.
- **PRF-007's lock is the seam most likely to grow.** If the fix starts pulling
  in other mutation paths, stop and split it into its own plan.
- **QM will diff against `origin/main`** (~50 commits behind local `main`) and
  flag already-merged W2/W3 work as out-of-scope. Reconcile against local `main`.
- **Ten stages is the top of the useful range.** Stages 6-9 are independent and
  could split off if the bundle proves too large in practice — but 1-5 must ship
  together, since they share the completion/outcome contract.
