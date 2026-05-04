---
id: TASK-255
title: 'Plan 1: runOneTask per-task envelope'
status: To Do
priority: high
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
updatedAt: '2026-05-04T18:25:57.795Z'
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
- [ ] #1 runOneTask(spec: DriverRunSpec, ctx: RunOneTaskCtx, taskId: string): Promise<TaskOutcome> is exported from lib/driver/run-one-task.ts.
- [ ] #2 Pre-flight failure: emits preflight(failed), returns {status:'blocked'} without modifying any TaskManager status.
- [ ] #3 Branch-mismatch detected at pre-flight: aborts immediately (returns blocked) before any status transition.
- [ ] #4 TaskManager.updateTask calls use Title Case literals ('In Progress','Done','Blocked') and the implementationNotes field for notes, never a 'note' field.
- [ ] #5 Commit step: acquires acquireRepoCommitLock around git-add + git-commit; excludes paths under missions/ and memory/; releases lock immediately after; emits commit_made with sha.
- [ ] #6 deriveOutcome: unknown+all-postverify-pass=success; unknown+any-postverify-fail=failure; explicit Report.outcome honored.
- [ ] #7 Per-task timeout via AbortController: timed-out spawn emits spawn_failed{exitCode:124}; task marked 'Blocked' via implementationNotes.
- [ ] #8 TaskManager failure after a successful commit: emits run_aborted('status update failed after commit'); commit stands; JSONL has commit_made but not task_done.
- [ ] #9 tests/driver/run-one-task.test.ts covers all branches (happy path, preflight fail, branch mismatch, partial, blocked, timeout, post-commit update failure, commit exclusion, deriveOutcome combinations, implementationNotes not note); bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
