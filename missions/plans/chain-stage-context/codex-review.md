---
kind: independent-review
reviewer: codex exec (gpt-5-codex)
plan: chain-stage-context
reviewedAt: '2026-09-10'
verdict: DO-NOT-SHIP (both findings now dispositioned)
---

# Independent codex review — chain-stage-context

Read-only correctness and liveness review of `git diff main...HEAD`, run after
the Quality Manager chain failed to return a verdict. Two findings.

## CDX-001 (high) — producer correlation did not bind the target to the execution — FIXED

`isCorrelatedAddressedProducer` verified that the claimed `producerStepId` names
a plan-revision step at the claimed `topologyIndex` that completed successfully,
but nothing tied the *claim* to that execution. After revision step A addresses
round 1, a later reviewer can bind round 2 — which clears the addressed state —
and an event copying A's `producerStepId`, `producerRole` and `topologyIndex`
while naming round 2 passes correlation and authorizes `task-manager`, although
no revision ever addressed round 2.

Reachable only by a forged or corrupted run-store event, not by any legitimate
topology: `readPersistedPlanReview` already clears addressed state on each new
target. It is still a real gap against D-013.3, which promises that "malformed,
corrupted, or misproduced activity fails correlation and blocks".

Fix: a loop-free durable step executes once, so it may authorize once.
`readPersistedPlanReview` now tracks spent `producerStepId`s while replaying and
marks a re-presented producer invalid.

Verified by mutation probe: with the guard removed the injected duplicate makes
the run **succeed** and spawn `task-manager`; with it, the run blocks with
`mismatched-addressed-evidence` and zero task-manager spawns. Evidence lives in
`tests/orchestration/run-start-chain-characterization.test.ts` under B-010.

## CDX-002 (medium) — guarded task-managers serialize behind parallel siblings — REJECTED, already recorded

Every guarded `task-manager` is deferred until all parallel siblings settle, so
in `[task-manager, worker]` with valid earlier evidence the worker always runs
first. A worker that waits for tasks would stall.

Rejected, for three reasons:

1. The plan already records this shape as deliberate — `plan.md` Risks: "Parallel
   task guards may fail after a safe sibling reviser finishes. This is deliberate
   for same-index unsafe topology; rerun with task-manager later."
2. The deferral is what makes the same-index outcome *deterministic*. It was
   implemented and reverted during this review: allowing a guarded task-manager
   to run concurrently when no sibling reviewer is present keeps the safety
   property (still blocked, still zero spawns) but makes the typed reason
   order-dependent, turning `nonpreceding-addressed-evidence` into
   `missing-addressed-evidence` and failing the B-008 case that pins the plan's
   state-table row.
3. The topology it describes was already unreliable before this change: a worker
   sharing a parallel group with the task-manager that creates its tasks raced
   that task-manager on `main` too.

A fix that preserved both determinism and concurrency would have to make the
guard wait only on review-relevant same-index siblings. That is real design work
beyond this slice; the plan's recorded remedy is to place `task-manager` in a
later step.
