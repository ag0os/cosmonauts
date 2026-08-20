---
type: decision
title: Episodic-log detached-terminal & resume hardening
description: Archived plan distillation for episodic-log-detached-hardening.
resource: knowledge/episodic-log-detached-hardening.md
tags:
  - 'plan:episodic-log-detached-hardening'
  - 'source:legacy-distillation'
timestamp: '2026-07-24T22:30:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/episodic-log-detached-hardening.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: episodic-log-detached-hardening
legacyDistilledAt: '''2026-07-24T22:30:00.000Z'''
legacySourceSha256: 13ff529b151adc9fae047602256b808a418e6e7c1c96b1e7817cf1ba4e8a4dea
---

# Episodic-log detached-terminal & resume hardening

## What Was Built

Correctness hardening for the *enabled* episodic-log Drive path: the seven
detached-terminal/resume edge defects deferred out of the shipped `episodic-log`
plan, plus the CDX-002 test-debt item. Enabled Drive runs now produce exactly one
honestly attributed terminal episode across normal, thrown, abort, settle, and
resume paths; detached capture warnings reach the live parent bus; status-transition
episode counts match persisted transitions; and plan locks no longer cover
successful terminal episode I/O. The `episodicLog.enabled` gate stays OFF by
default and this plan made no adoption decision.

A follow-on slice (TASK-498/500/501, archived alongside) then hardened the shared
primitives the reviews surfaced — these were pre-existing on `main`, not
regressions from this work.

## Key Decisions

- **D-001 — drain the bridge after a terminal; never reorder the terminal path.**
  The three ordering wants (terminal event first, completion⇒terminal invariant,
  diagnostics reach the parent) are *mutually unsatisfiable with one completion
  write*. A narrow post-terminal drain that forwards only
  `episode_capture_failed` diagnostics satisfies all three consumers without
  changing child JSONL order. Capturing before the terminal event was tried and
  rejected after a real happy-path ordering regression.
- **D-002 — the terminal ledger is two-phase (intent → confirmation), not
  write-after-success.** Write-after-success is *not reconstructible*: the thrown
  path passes no timestamp, so `recordEpisode` stamps wall-clock into both the
  rendered bytes and the filename hash. A crash between the episode landing and
  its marker meant a later resume wrote a differently-stamped terminal that
  content-dedupe could not collapse — resurrecting the exact `failed`+`aborted`
  pair the plan existed to eliminate. Persisting *intent first* makes the
  interrupted window replayable byte-identically. An `intended` record means
  "owned, with this exact content", not "done", so capture stays retryable.
- **D-003 — trust a frozen source on the execution path only when `agentId` is
  exactly `worker`.** Anything else is provenance-only; execution re-resolves and
  mints fresh identity. Reconcile-only resume leaves frozen sources untouched.
- **D-004 — release terminal locks through an `onTerminalPersisted` hook.** It
  fires after completion persistence and before capture, on completion-backed
  terminals only. Hook rejection is isolated from the broad terminal catch, cannot
  reclassify a persisted result, and *suppresses capture* rather than running it
  under an unreleased lock.
- **D-005 — terminal-only resume prepares identity when a completion already
  exists**, even with graph resume state. The original criterion was stricter than
  its stated intent and excluded every real run (all production Drive runs are
  graph-backed), so the behavior was only ever proven where it was never in doubt.
- **D-010 — OFF-state byte identity explicitly excludes the plan-lock-release
  *failure* path.** AC-001 and B-023 are mutually exclusive there; B-023 wins,
  because restoring exact parity would reinstate `main`'s worse semantics (a fully
  successful run reported as failed because post-run lock cleanup failed).

## Patterns Established

- **Named narrowing over silent drift.** When a criterion and a behavior genuinely
  conflict (D-010, SF-001), amend the criterion in text with the reasoning rather
  than quietly letting the code diverge.
- **Exclusive claims use `link`/`rename`, never read-then-write.** The terminal
  ledger claim (`claimDriveTerminalIntent`) writes a temp and `link`s it into
  place; the loser reads the winner's record and replays it, so both converge on
  byte-identical content and the store dedupes to one.
- **Fail-soft is a contract, not a nicety (D-008).** A lock error must never fail
  or stall an update that already persisted. Locks here are enhancements over
  `main`'s unlocked behavior, so the floor is *never worse than `main`* — a rule
  that later caught a real regression (see Gotchas).
- **Unsafe caller input is hashed into lock filenames**, not interpolated:
  `getTaskEpisodeTransitionLockPath` falls back to a sha256 segment for ids that
  fail a safe-shape test, keeping `.cosmonauts/*.lock` flat and inside the
  single-level ignore glob.
- **OFF-state identity is a hard gate proven by assertion, not inferred.** CDX-001
  showed enabled-path wiring leaking into layout, so every slice re-proves that
  gate-OFF bytes match `main`.

## Files Changed

- `lib/driver/drive-graph-runner.ts` — terminal ordering, episode identity,
  ledger claim/confirm around capture.
- `lib/driver/run-state.ts` — `run.terminal-episodes/` two-phase ledger,
  `claimDriveTerminalIntent`, completion read/write and fallback preservation.
- `lib/driver/driver.ts`, `lib/driver/run-step.ts` — live launch state for abort,
  `onTerminalPersisted` hook wiring, removal of redundant completion rewrites.
- `lib/driver/event-stream.ts` — post-terminal drain forwarding only
  `episode_capture_failed`, with a bounded exit.
- `lib/entity-file-lock.ts` (new, generalized from `lib/tasks/lock.ts`) —
  shared per-entity cross-process lock; `lib/tasks/lock.ts` stays a thin caller.
- `lib/memory/episode-transition-lock.ts` — gate-aware, fail-soft lock selection.
- `lib/plans/plan-manager.ts`, `lib/tasks/task-manager.ts` — read→merge→write→
  transition-decision serialized only when episode context is present and the
  gate resolves enabled.
- `cli/drive/subcommand.ts` — F-005 identity preparation before the terminal-only
  resume early return.

## Gotchas & Lessons

- **The three terminal-ordering wants cannot all be satisfied with one completion
  write.** Anyone revisiting this ordering should start from D-001's rejected
  alternatives rather than rediscovering the conflict.
- **A criterion can be stricter than its intent and hide it by passing.** D-005's
  precondition excluded exactly the production case it existed to fix; the tests
  passed only because their fixtures carried no durable graph run. When a
  criterion passes, check it is reachable in production, not just in the fixture.
- **Integration reports go stale.** `integration-report.md` records
  `overall: incorrect` for I-001 (unsafe task-id lock paths). That was fixed, with
  a regression test, before archive. Verify findings against the code, not the
  report.
- **Locks that only *sometimes* have a timeout are a trap.** The follow-on work
  found that `withTaskCreateLock` waits with no timeout, so a lock left held by a
  live PID that nobody will release hung task creation for the process lifetime.
  A "degrades fail-soft" claim is only true for callers that actually pass a
  timeout — check the caller, not the primitive.
- **Stale-lock reclamation on a shared pathname cannot be made fully safe with
  Node's stdlib.** `rename` claims an inode atomically but does not reserve the
  *pathname*, so a slot is briefly empty between claim and restore. There is no
  portable `flock`/`fcntl`, `renameat2(RENAME_EXCHANGE)`, or inode-conditional
  unlink. The only stdlib closure is a protocol redesign (per-entity contender
  directory with a Lamport-bakery queue) — deferred, and documented in the
  archived TASK-498. Revisit when concurrent task creation rises (agent swarms).
- **Fixes in this area have a high defect-introduction rate.** Across four
  independent review rounds on the follow-on slice, three findings were in code
  written to fix the *previous* finding, not in the original defects. Budget for
  review rounds after remediation, not just after implementation.
