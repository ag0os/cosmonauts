---
id: TASK-803
title: >-
  Slice 10 follow-up: carry the worktree snapshot ref inside the attempt's Drive
  record
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-799
createdAt: '2026-09-29T19:57:07.517Z'
updatedAt: '2026-09-29T20:05:08.173Z'
---

## Description

Coordinator follow-up to slice 10 (TASK-799), plan decision D-033, source INV-001 and D-020. Owns the note-placement clause of B-011. Governed by D-001, D-018, D-020, D-021, D-022, D-030, D-033.

**Finding.** `recordWorktreeSnapshot` in `lib/driver/runtime-helpers.ts` appends a bare paragraph `Drive worktree snapshot (attempt n): refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` to the task's implementation notes at spawn time on both Drive paths, for every attempt with a dirty tree, including attempts that end Done. Ratified INV-001 binds exactly: "anything Drive adds to a task is appended under a heading that names Drive, the outcome, and the attempt." D-020 places the ref "in the attempt's Drive note and in a `worktree_snapshot` field on the next `spawn_started` event".

**Change (Design, derived).** `snapshotWorktree` still creates the ref and returns it, but writes nothing to the task. Both task paths (legacy `run-one-task.ts` and graph `drive-scheduler-backend.ts`) hold the ref in memory for the attempt and pass it to the Drive-record formatter so that, whenever an attempt record is appended (blocked, failure, partial, unknown, spawn failure), the record body contains one line `Worktree snapshot: <ref>` before the reason/raw text. A `success` attempt writes no note (Design §2 matrix); its ref remains on `spawn_started` and is removed by terminal cleanup when the task ends Done. `spawn_started.worktreeSnapshot`, ref naming, retention on blocked/partial/aborted, the guard refusal text that names the ref, and the graph/legacy parity are unchanged. Remove `recordWorktreeSnapshot` (or make it a no-op-free helper that only formats the line). Standing worker rules: notes only through `task_edit` append mode; a human question is `outcome: blocked`; do not stage or commit (Drive owns the commit).

<!-- AC:BEGIN -->
- [ ] #1 No standalone snapshot note: after this change, no code path calls `updateTask` with a snapshot-only append; a dirty-tree attempt that ends `success` leaves the worker's implementation notes byte-identical on both Drive paths (test: notes before spawn equal notes after Done).
- [ ] #2 The ref is inside the record: for blocked, failure, partial, unknown, and spawn-failure attempts on both paths, the appended `### Drive — outcome <o> — attempt <n> — run <runId>` record contains the line `Worktree snapshot: refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` when the tree was dirty at spawn and no such line when it was clean; exactly one Drive record per attempt (D-022) and the worker's bytes precede it unchanged (INV-001).
- [ ] #3 `spawn_started` still carries `worktreeSnapshot` with the same ref on both paths; refs are kept for blocked/partial/aborted tasks and removed when the task ends Done; the Git guard refusal text still names the ref (slice 10 tests for these keep passing unchanged).
- [ ] #4 Tests that pinned the standalone paragraph (slice 10's `snapshots tracked and untracked bytes`, `snapshots dirty tracked and untracked bytes`, and the run-one-task blocked-notes assertion that expects `Drive worktree snapshot (attempt 1): …` before the Drive heading) change their expectation to the in-record line, each with an inline comment citing INV-001 and D-033 (AC-020: they pin the defect this task removes and were introduced on this branch). No other expectation changes; no `.skip/.only/.todo`.
- [ ] #5 D-030: implementation notes record one failing run before the change (test name, commit, one-line failure: the standalone paragraph is present / the record lacks the line) and one passing run after, plus a mutation check.
- [ ] #6 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change; `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all pass; a collision with ratified ground is stop-and-escalate (`outcome: blocked`).
<!-- AC:END -->

## Implementation Notes

### Coordinator note before attempt 1 (2026-09-29, after run run-18d6659d aborted)

Your first run aborted before spawn: `snapshotWorktree` (slice 10) passed `:(exclude)missions/sessions :(exclude)missions/archive/sessions` to `git add -A` on the temporary index, and git exits 1 when an exclude pathspec names only gitignored paths. The tree is always dirty at spawn (Drive has just set the task file to In Progress), so every Drive run on this repository failed. The coordinator fixed it by hand as a launch-path repair, test first: `tests/driver/worktree-snapshot.test.ts` (red on the slice-10 code with the production error, green after `git add -A -- .` alone; ignored paths are skipped by git anyway). Keep that test green and do not reintroduce exclude pathspecs. Your own change (D-033) is unaffected: remove the standalone note append and carry the ref inside the attempt's Drive record; the new test asserts only the ref and its tree, not the note.

Correction to the note above: `git add -A -- .` alone broke the detached-run suites (`tests/driver/parity.test.ts`, `cross-plan-commit-lock`), whose fixture repos do not ignore `missions/sessions`. The committed mechanism is a temporary `core.excludesFile` (`missions/sessions/`, `missions/archive/sessions/`) passed as `git -c core.excludesFile=<tmp> add -A -- .` on the temporary index. Keep that; do not use `:(exclude)` pathspecs.