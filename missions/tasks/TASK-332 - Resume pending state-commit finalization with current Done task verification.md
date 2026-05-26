---
id: TASK-332
title: Resume pending state-commit finalization with current Done task verification
status: To Do
priority: high
labels:
  - api
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-330
  - TASK-331
createdAt: '2026-05-22T19:58:01.023Z'
updatedAt: '2026-05-22T19:58:01.023Z'
---

## Description

Complete CLI resume recovery for run-level state commit finalization and enforce the plan-reviewer readiness requirement that external acceptance prove current task state. Owns B-008 and the resume half of B-015 from source AC-004, AC-006, AC-008, AC-012. Seams: `cli/drive/subcommand.ts`, `lib/driver/run-state.ts`, `lib/tasks/task-manager.ts`, `lib/driver/run-run-loop.ts`. Named tests: `tests/cli/drive/run.test.ts` > `resume refuses state commit external acceptance when pending tasks are missing or not done`; `resume retries pending state commit without invoking backend work`. Tests must carry markers `@cosmo-behavior plan:drive-resilience-state-model#B-008` and `#B-015`.

<!-- AC:BEGIN -->
- [ ] #1 B-015: Resume detects `state_commit` pending finalization and retries only the final state commit without rerunning any task backend.
- [ ] #2 B-015: Successful state-commit retry clears pending finalization and allows the run to complete under the exact finalization result contract.
- [ ] #3 B-008: External state-commit acceptance clears pending state only when the pending phase is `state_commit`, no committable state changes remain for pending task files, current `HEAD` differs from `headBeforeFinalization`, and every pending task resolves through `TaskManager.getTask()` with status `Done`.
- [ ] #4 B-008: A clean worktree plus changed `HEAD` is refused when any pending task is missing or not `Done`; pending state remains and the run reports finalization failure.
- [ ] #5 Dirty-worktree guard bypass is limited to initial pending finalization retry and is recomputed before any remaining backend work proceeds.
<!-- AC:END -->
