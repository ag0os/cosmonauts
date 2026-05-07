---
id: TASK-255
title: 'Plan 1: runOneTask per-task envelope'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
  - TASK-250
  - TASK-251
  - TASK-252
  - TASK-253
createdAt: '2026-05-04T17:33:35.133Z'
updatedAt: '2026-05-04T19:22:37.323Z'
---

## Description

Implement `lib/driver/run-one-task.ts` and `tests/driver/run-one-task.test.ts`.

See **Implementation Order step 6**, **Approach > runOneTask body**, **D-P1-1**, **D-P1-5**, **D-P1-6**, **D-P1-16**, QC-003–QC-007, QC-011, QC-015–QC-017 in `missions/plans/driver-primitives/plan.md`.

Per-task sequence: emit `task_started` → pre-flight (branch check + preflightCommands) → `status="In Progress"` → render prompt → `spawn_started` → `backend.run(invocation)` → `parseReport` → emit `spawn_completed(ParsedReport)` or `spawn_failed` → post-verify → `deriveOutcome` → optional commit (with repo lock) → status transition.

Cross-plan invariants:
- `TaskManager.updateTask` uses **Title Case** literals: `"In Progress"`, `"Done"`, `"Blocked"` — never lowercase.
- Notes go in `implementationNotes` field, **NOT** `note`.
- Commit step acquires `acquireRepoCommitLock` (brief, around `git add`/`git commit` only) then releases immediately.
- `deriveOutcome`: `unknown + all-postverify-pass → success`; `unknown + any-postverify-fail → failure`; explicit values honored.
- `git add` excludes paths under `missions/` and `memory/`.

<!-- AC:BEGIN -->
- [x] #1 runOneTask(spec: DriverRunSpec, ctx: RunOneTaskCtx, taskId: string): Promise<TaskOutcome> is exported from lib/driver/run-one-task.ts.
- [x] #2 Pre-flight failure: emits preflight(failed), returns {status:'blocked'} without modifying any TaskManager status.
- [x] #3 Branch-mismatch detected at pre-flight: aborts immediately (returns blocked) before any status transition.
- [x] #4 TaskManager.updateTask calls use Title Case literals ('In Progress','Done','Blocked') and the implementationNotes field for notes, never a 'note' field.
- [x] #5 Commit step: acquires acquireRepoCommitLock around git-add + git-commit; excludes paths under missions/ and memory/; releases lock immediately after; emits commit_made with sha.
- [x] #6 deriveOutcome: unknown+all-postverify-pass=success; unknown+any-postverify-fail=failure; explicit Report.outcome honored.
- [x] #7 Per-task timeout via AbortController: timed-out spawn emits spawn_failed{exitCode:124}; task marked 'Blocked' via implementationNotes.
- [x] #8 TaskManager failure after a successful commit: emits run_aborted('status update failed after commit'); commit stands; JSONL has commit_made but not task_done.
- [x] #9 tests/driver/run-one-task.test.ts covers all branches (happy path, preflight fail, branch mismatch, partial, blocked, timeout, post-commit update failure, commit exclusion, deriveOutcome combinations, implementationNotes not note); bun run test passes.
<!-- AC:END -->

## Implementation Notes

Completed runOneTask coverage in tests/driver/run-one-task.test.ts. Source existed from prior partial commit d05a4d3; this session fixed/landed the test file in commit 1de642c. Verified: file exists; bun run test --grep "run-one-task"; bun run test; bun run typecheck; bun run lint.
