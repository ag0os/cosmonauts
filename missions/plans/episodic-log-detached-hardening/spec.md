# Spec — episodic-log detached-terminal & resume hardening

Follow-up to the shipped `episodic-log` plan (agent-memory W3, archived at
`missions/archive/plans/episodic-log/`). Every finding below was verified
against ground truth during that plan's Quality Manager pass and independent
codex review; concrete file:line evidence lives in the archived `qm-review.md`.
All of it sits behind the off-by-default episodic-log gate — none of this
affects a default install.

## Purpose

The `episodic-log` QM and codex reviews surfaced a cluster of narrow,
enabled-only defects in Drive's detached-terminal identity and resume paths.
They were **deliberately deferred** — not missed — because their correct fixes
touch the D-009 completion/outcome contract across `lib/driver/driver.ts`,
`cli/drive/subcommand.ts`, and
`domains/shared/extensions/orchestration/driver-tool.ts` and must be designed
together, not patched piecemeal. One attempted drive-by fix (an F-003 reorder)
was reverted because it traded a detached failure-of-a-failure edge for a
happy-path event-ordering regression (confirmed by a real test failure).

Why now: this hardening sits between W3 and the later adoption decision.
`memory-consolidation` (W4) will consume the episodic store this path writes;
duplicate terminals (PRF-003), misattributed sources (SR-001), and silently
missing terminals (F-005) are exactly the corruption a consolidation job
cannot repair after the fact.

## Users

- **The human running enabled detached Drive runs** — gets exactly-one,
  honestly-attributed terminal episodes per attempt, and sees capture-failure
  warnings live in the parent session instead of only in post-hoc files.
- **Drive parent-session consumers** (`waitForCompletion` + `watch_events`,
  real Drive callers) — keep the invariant they already rely on: a completion
  file present means the terminal legacy event was already emitted.
- **`memory-consolidation` (W4, sibling plan)** — inherits a clean episodic
  input: no duplicate `failed`+`aborted` pairs, no episodes naming a worker
  that never ran.

## User Experience

All flows below assume the episodic-log gate is **on**; with the gate off,
behavior is byte-identical to today.

**Detached capture failure (F-003 / UR-002):** a terminal-capture-failure
`driver_diagnostic` in a detached run reaches the parent session bus and is
visible live, in addition to persisting to the legacy JSONL and the durable
store (which already work). Today the bridge stops on the terminal event, so
the live parent bus alone misses it.

**Thrown Drive exit, then resume (PRF-003):** a thrown exit records its
`failed` terminal at wall-clock; the settle path and a later resume must not
add a second `aborted` terminal for the same attempt. One attempt, one
terminal, per D-009.

**Abort in the pre-spawn window (PRF-002):** aborting a detached run before
the child spawns neither leaks a child process nor produces duplicate
terminals, and a stamped completion is never overwritten by an unstamped one.
Fix reads live launch state instead of the current by-value
`child`/`workdirCreated` snapshot; the resume-duplicate leg is entangled with
PRF-003 and must be designed with it.

**Plan-lock latency (PRF-004):** Drive releases the plan lock before
non-load-bearing episode/diagnostic I/O. Perf-only, but lock-release
reordering interacts with cross-plan commit serialization — needs focused
design, not a casual move.

**Concurrent status updates (PRF-007):** same-entity plan/task status updates
from multiple sessions no longer over/mis-count transition episodes. The
underlying non-serialized read/merge/write/decide is largely pre-existing;
scope depth is an open question below.

**Terminal-only resume after enabling the log (F-005):** `--resume` of a run
that completed while logging was *off* (then enabled) currently records no
terminal, because no `episodeAttemptId` was frozen. The fix mints a
**deterministic** (run-id-derived, not random) attempt id and persists it so
repeated resumes dedupe idempotently. The shipped plan text was internally
inconsistent here; the fix must also reconcile the live behavior docs
(`docs/memory.md`, `memory/episodic-log.md` if touched).

**Frozen-source honesty on resume (SR-001 residual):** the CDX-001 fix already
severed arbitrary-agent *selection*, and the CDX-002 fix stopped
stale-source misattribution when the frozen worker no longer resolves. What
remains is honesty hardening: whether to require `agentId === "worker"` before
trusting a frozen `episodeSource` for execution, keeping `episodeSource` for
provenance only. Threat model is low (local, gitignored, project-owned
artifact) — see Open Questions.

## Hard design constraint (learned the expensive way)

For a Drive terminal there are three ordering wants that are **mutually
unsatisfiable with a single completion write**:

1. **D-009**: `writeRunCompletion` before episode capture (identity is derived
   from completion content).
2. **B-026 (detached)**: a capture-failure `driver_diagnostic` must precede
   the terminal legacy event in the child JSONL, because the parent bridge
   stops bridging on the terminal event.
3. **Relied-upon invariant**: the terminal legacy event must be emitted before
   the completion file is observable, because inline consumers
   (`waitForCompletion` + `watch_events`, and real Drive callers) treat
   "completion file present" as "run_completed already emitted."

Any design must resolve this explicitly — e.g. a separate diagnostic channel
to the parent bus that does not depend on child-JSONL ordering, or a two-phase
completion marker — never by just reordering the three steps. The reverted
F-003 reorder is the proof.

## Acceptance Criteria

All criteria are gate-ON unless stated otherwise. The `AC-###` labels are
durable identifiers — behaviors in `plan.md` cite them by ID, so criteria must
never be renumbered on edit; append new ones instead.

- **AC-001** — With the gate **off**, every touched path behaves
  byte-identically to current `main` (session/manifest layout, event ordering,
  output text) — the CDX-001 lesson says enabled-path changes can leak; prove
  they don't. *Narrowed 2026-07-24 by plan.md's D-006:* one exclusion, the
  plan-lock-release-failure path, where OFF now resolves with the persisted
  result plus a `terminal_persisted_hook_failed` diagnostic rather than
  rejecting as `main` does. This resolves an unavoidable conflict with AC-007 /
  B-023 (a release failure must never replace the persisted result). Every OFF
  path that does not hit a release failure remains byte-identical, and
  divergence there is still a hard failure.
- **AC-002** — In a detached run whose terminal episode capture fails, the
  `driver_diagnostic` is observable on the live parent session bus, and the
  inline happy-path ordering suite stays green (the invariant in constraint 3
  holds).
- **AC-003** — A thrown Drive exit followed by settle and/or resume yields
  **exactly one** terminal episode for that attempt — never a
  `failed`+`aborted` pair. This must hold even when the process dies between a
  successful episode write and its bookkeeping.
- **AC-004** — Aborting a detached run in the pre-spawn window leaves no live
  child process, at most one terminal, and never overwrites a stamped
  completion with an unstamped one.
- **AC-005** — Terminal-only `--resume` of an off-then-enabled completed run
  records exactly one terminal episode; running the same resume again records
  nothing new (idempotent via the deterministic attempt id). `docs/memory.md`
  matches the shipped behavior.
- **AC-006** — Concurrent same-entity status updates from two sessions produce
  transition episode counts matching the actual transitions (to the depth
  decided in Open Questions).
- **AC-007** — Drive does not hold the plan lock during episode/diagnostic
  I/O, and cross-plan commit serialization behavior is unchanged (existing
  suites green). No hardening path may leave a plan lock permanently held.
- **AC-008** — A dedicated CDX-002 regression test exists (see Test debt) and
  fails against the pre-CDX-002 behavior.
- **AC-009** — Full verification gates pass: tests, lint, typecheck.

No new artifact this plan introduces (lock files, ledger markers) may be
written where the project's own scanners will mistake it for a plan, task, or
source file, or where it would dirty a git-tracked directory.

## Test debt to close

**CDX-002 regression test (execution-path resume, unavailable frozen
worker).** The shipped fix (`cli/drive/subcommand.ts`
`frozenWorkerLostForExecution`) is verified by data-flow reasoning plus the
green reconcile/normal-resume suites, but has no dedicated test, and neither
existing fixture supports it: `tests/cli/drive/graph-resume.test.ts` is
reconcile-only (backend not called, `remainingTaskIds: []`), and
`tests/extensions/orchestration-driver-tool.test.ts` is the `run_driver` tool
path (no CLI `--resume` frozen-source semantics). New scaffolding needed: a
persisted run with a frozen `episodeSource` whose worker no longer resolves,
`remainingTaskIds` non-empty (execution), inline `cosmonauts-subagent`; assert
the resumed spec omits `episodeSource`/`episodeAttemptId` while the fallback
worker executes and no episode names the stale source.

## Scope

Included:
- The seven deferred findings: F-003/UR-002, PRF-003, PRF-002, PRF-004,
  PRF-007, F-005, SR-001 residual hardening.
- The CDX-002 dedicated regression test and its new resume-fixture
  scaffolding.
- Reconciling live docs (`docs/memory.md`) where F-005 changes behavior.

Excluded:
- Anything the `episodic-log` plan already shipped and verified.
- Turning the gate on by default (the later adoption decision).
- Fully serializing the pre-existing non-serialized plan/task update path, if
  the planner scopes PRF-007 to episode-counting correctness only (see Open
  Questions).

## Assumptions

- The archived `missions/archive/plans/episodic-log/qm-review.md` remains the
  authoritative evidence for each finding's file:line ground truth; findings
  are not re-verified from scratch before design.
- The episodic-log gate stays off by default throughout; no adoption decision
  is smuggled in.
- The D-009 exactly-one-terminal contract and the completion-file⇒terminal
  invariant (constraint 3) are load-bearing and must survive unchanged from
  consumers' perspective.
- F-005's deterministic run-id-derived attempt id is a settled decision
  (carried from the original scoping), not a planner choice.

## Open Questions — resolved during design

All four were the planner's call and are now decided in `plan.md` (§Design).
Recorded here so they are not re-litigated downstream.

- **Ordering-constraint mechanism:** RESOLVED — post-terminal *drain* in the
  JSONL→bus bridge, forwarding only `episode_capture_failed` diagnostics after
  the terminal event. No reordering; all three constraints keep their
  consumers. Two-phase completion marker rejected (changes the completion
  contract for every consumer to fix a failure-of-a-failure path).
- **SR-001 residual:** RESOLVED — yes, guard it. Execution attempts trust a
  frozen `episodeSource` only when its `agentId` is `worker`; otherwise it is
  provenance-only. Reconcile-only resumes are unaffected.
- **PRF-007 depth:** RESOLVED — episode-counting correctness only, via
  per-entity serialization of the status read→decide→write window. Broader
  serialization of the managers' other mutation paths stays out of scope.
- **PRF-004 ordering:** RESOLVED — an `onTerminalPersisted` hook fired after the
  completion write and before episode capture. Nothing after that point touches
  git, the run store, or the completion file, so cross-plan commit
  serialization is unaffected.

## Recommended next step

Design is complete in `plan.md`. Next: `/spec-to-backlog`, then
`/implement-plan`.
