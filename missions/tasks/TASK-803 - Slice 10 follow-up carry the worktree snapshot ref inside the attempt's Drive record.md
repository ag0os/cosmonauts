---
id: TASK-803
title: >-
  Slice 10 follow-up: carry the worktree snapshot ref inside the attempt's Drive
  record
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-799
createdAt: '2026-09-29T19:57:07.517Z'
updatedAt: '2026-09-29T20:22:28.888Z'
---

## Description

Coordinator follow-up to slice 10 (TASK-799), plan decision D-033, source INV-001 and D-020. Owns the note-placement clause of B-011. Governed by D-001, D-018, D-020, D-021, D-022, D-030, D-033.

**Finding.** `recordWorktreeSnapshot` in `lib/driver/runtime-helpers.ts` appends a bare paragraph `Drive worktree snapshot (attempt n): refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` to the task's implementation notes at spawn time on both Drive paths, for every attempt with a dirty tree, including attempts that end Done. Ratified INV-001 binds exactly: "anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt." D-020 places the ref "in the attempt's Drive note and in a `worktree_snapshot` field on the next `spawn_started` event".

**Change (Design, derived).** `snapshotWorktree` still creates the ref and returns it, but writes nothing to the task. Both task paths (legacy `run-one-task.ts` and graph `drive-scheduler-backend.ts`) hold the ref in memory for the attempt and pass it to the Drive-record formatter so that, whenever an attempt record is appended (blocked, failure, partial, unknown, spawn failure), the record body contains one line `Worktree snapshot: <ref>` before the reason/raw text. A `success` attempt writes no note (Design §2 matrix); its ref remains on `spawn_started` and is removed by terminal cleanup when the task ends Done. `spawn_started.worktreeSnapshot`, ref naming, retention on blocked/partial/aborted, the guard refusal text that names the ref, and the graph/legacy parity are unchanged. Remove `recordWorktreeSnapshot` (or make it a no-op-free helper that only formats the line). Standing worker rules: notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit (Drive owns the commit).

<!-- AC:BEGIN -->
- [x] #1 No standalone snapshot note: after this change, no code path calls `updateTask` with a snapshot-only append; a dirty-tree attempt that ends `success` leaves the worker's implementation notes byte-identical on both Drive paths (test: notes before spawn equal notes after Done).
- [x] #2 The ref is inside the record: for blocked, failure, partial, unknown, and spawn-failure attempts on both paths, the appended `### Drive — outcome <o> — attempt <n> — run <runId>` record contains the line `Worktree snapshot: refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` when the tree was dirty at spawn and no such line when it was clean; exactly one Drive record per attempt (D-022) and the worker's bytes precede it unchanged (INV-001).
- [x] #3 `spawn_started` still carries `worktreeSnapshot` with the same ref on both paths; refs are kept for blocked/partial/aborted tasks and removed when the task ends Done; the Git guard refusal text still names the ref (slice 10 tests for these keep passing unchanged).
- [x] #4 D-030: implementation notes record one failing run before the change (test name, commit, one-line failure: the standalone paragraph is present / the record lacks the line) and one passing run after, plus a mutation check.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; a collision with ratified ground is stop-and-escalate (`outcome: blocked`).
- [x] #6 Tests whose expectation pins the standalone snapshot note introduced by slice 10 (commit 852c92b6) change to the in-record line, each with an inline comment citing INV-001 and D-033 (AC-020: they pin the defect this task removes and were introduced on this branch). Known pins: slice 10's `snapshots tracked and untracked bytes` and `snapshots dirty tracked and untracked bytes`, the run-one-task blocked-notes assertion expecting `Drive worktree snapshot (attempt 1): …` before the Drive heading, and the `updateStatuses` sequence at `tests/extensions/orchestration-driver-tool.test.ts` (the two extra `undefined` entries slice 10 added for the snapshot-only updates); any further pin of the same kind qualifies under the same rule. No other expectation changes; no `.skip/.only/.todo`.
<!-- AC:END -->

## Implementation Notes

### Coordinator note before attempt 1 (2026-09-29, after run run-18d6659d aborted)

Your first run aborted before spawn: `snapshotWorktree` (slice 10) passed `:(exclude)missions/sessions :(exclude)missions/archive/sessions` to `git add -A` on the temporary index, and git exits 1 when an exclude pathspec names only gitignored paths. The tree is always dirty at spawn (Drive has just set the task file to In Progress), so every Drive run on this repository failed. The coordinator fixed it by hand as a launch-path repair, test first: `tests/driver/worktree-snapshot.test.ts` (red on the slice-10 code with the production error, green after `git add -A -- .` alone; ignored paths are skipped by git anyway). Keep that test green and do not reintroduce exclude pathspecs. Your own change (D-033) is unaffected: remove the standalone note append and carry the ref inside the attempt's Drive record; the new test asserts only the ref and its tree, not the note.

Correction to the note above: `git add -A -- .` alone broke the detached-run suites (`tests/driver/parity.test.ts`, `cross-plan-commit-lock`), whose fixture repos do not ignore `missions/sessions`. The committed mechanism is a temporary `core.excludesFile` (`missions/sessions/`, `missions/archive/sessions/`) passed as `git -c core.excludesFile=<tmp> add -A -- .` on the temporary index. Keep that; do not use `:(exclude)` pathspecs.

Drive worktree snapshot (attempt 1): refs/cosmonauts/drive/run-9f8e9d40-5b0b-4920-9400-4343f3d5fe0c/TASK-803/attempt-1

D-030 evidence (HEAD f2d6242c1ecd78fc18d2c565cd057d04fa7547ea): before production changes, `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts` failed 7 snapshot/blocked-note cases: standalone paragraph present, in-record line absent; after change `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts tests/driver/worktree-snapshot.test.ts` passed 56/56. Mutation: replaced `snapshotLine` with empty string and reran `bun run test -- tests/driver/run-one-task.test.ts tests/driver/drive-scheduler-backend.test.ts`; 15 failures in dirty-tree in-record assertions; restored line. Changed-scope analysis provider unbound (execution-not-consented), not clean evidence.

HALT — ratified AC #4 conflicts with required AC #6: `tests/extensions/orchestration-driver-tool.test.ts` asserts 5 updateTask statuses including two snapshot-only append updates, which D-033 removes. `bun run test` failed 1/4070: `driver postverify failure blocks task and does not commit`: `expected [ 'In Progress', undefined, 'Blocked' ] to deeply equal [ 'In Progress', undefined, …(3) ]` at line 635. AC #4 expressly allows expectation changes only for three named slice-10 tests and says 'No other expectation changes'; changing this fourth assertion is necessary for the suite to pass and is forbidden. Draft decision for human: Ground: AC #4's 'No other expectation changes' versus AC #6's full-test pass and INV-001/D-033 no standalone snapshot append. Option A (recommended): authorize this one additional expectation correction to three updates, with inline INV-001/D-033 citation; retain test's status-only finalizer assertion. Option B: retain AC #4 strictly and suspend the full-suite requirement until separately authorized correction; do not fake task updates to satisfy the count, as that would violate INV-001. Invariant at stake: Drive adds notes only under an outcome/attempt heading, and successful attempts do not write snapshot notes. Production and owned tests are left uncommitted for coordinator; `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` not run after this ratified-ground collision. Changed-scope audit unavailable (unbound: execution-not-consented).

### Drive — outcome blocked — attempt 1 — run run-9f8e9d40-5b0b-4920-9400-4343f3d5fe0c

{
  "outcome": "blocked",
  "notes": "AC #4 forbids changing any expectation beyond three named tests, but another test still expects the snapshot-only task updates that D-033 removes. `bun run test` failed 1/4070 at `tests/extensions/orchestration-driver-tool.test.ts:635`: `expected [ 'In Progress', undefined, 'Blocked' ] to deeply equal [ 'In Progress', undefined, …(3) ]`. A proposed human decision is recorded in TASK-803’s implementation notes. Changes remain uncommitted; the other required checks were not run after this ratified-ground collision."
}
outcome: blocked

Dirty paths:
 M lib/driver/drive-scheduler-backend.ts
 M lib/driver/run-one-task.ts
 M lib/driver/runtime-helpers.ts
 M "missions/tasks/TASK-803 - Slice 10 follow-up carry the worktree snapshot ref inside the attempt's Drive record.md"
 M tests/driver/drive-scheduler-backend.test.ts
 M tests/driver/run-one-task.test.ts
 M tests/driver/worktree-snapshot.test.ts

### Coordinator note before attempt 2 (2026-09-29)

Not a human decision. The `updateStatuses` assertion at `tests/extensions/orchestration-driver-tool.test.ts:635` gained its two extra `undefined` entries in slice 10 (`852c92b6`) precisely for the snapshot-only task updates that D-033 removes, so it pins the defect this task removes; the criterion listed three such pins and missed this fourth. Former AC #4 is replaced (now the last criterion) by a rule that names all four and covers any further pin of the same kind. Change that expectation back to the pre-slice-10 sequence with an inline INV-001 / D-033 comment, then run all five gates and report. Your attempt-1 work is uncommitted in the tree; continue from it.

Attempt 2: slice-10 ref/event/guard tests passed (full suite 4070/4070); dirty blocked retains refs, Done deletes refs on legacy and graph paths. Initial `bun run test` had a detached cross-plan timeout (`timed out waiting for file: .../first-plan-lock.json`, child exit 127); that test passed alone and the entire suite passed on rerun. Changed-scope audit base faf1f815ff9ff68298c3506ee42dad8277fb18f1: unbound (execution-not-consented); evidence unavailable, not a clean result.

AC #6: corrected the slice-10 `updateStatuses` snapshot-only update pin to the pre-slice-10 three-update sequence; inline comment cites INV-001/D-033. No other expectation changes beyond the four named defect pins; no skips/only/todo introduced. `bun run typecheck` initially rejected the new blocked-report test fixture (`"blocked"` not a ReportOutcome); changed only that new fixture's report formatting, then typecheck passed.

Attempt 2 verification: `bun run test` passed 292 files/4070 tests on rerun; `bun run lint`, `bun run typecheck`, `bun run check:reachability` (214/214 runtime lib modules), `bun run check:suppressions -- --base main` passed. Changed files limited to driver snapshot/attempt handling, owned tests, and task progress; no durable-runtime, envelope, liveness, suppression, baseline, ignore-pattern, threshold, or configuration change. Drive owns commit; no staging/commit by worker.