---
id: TASK-336
title: Run Drive resilience integration and artifact-conformance verification
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-327
  - TASK-328
  - TASK-332
  - TASK-333
  - TASK-334
  - TASK-335
createdAt: '2026-05-22T19:58:37.068Z'
updatedAt: '2026-05-26T16:10:25.298Z'
---

## Description

Perform the plan's final regression/coherence pass after behavior work lands, repairing only integration issues within the approved Drive resilience scope. This task does not own a new B-### behavior; it verifies the whole behavior set B-001 through B-021 and source AC-018/AC-019 quality constraints. Seams are the complete file set named by the plan, especially driver core, CLI Drive, orchestration extensions, and Drive guidance. Behavior tests must retain their `@cosmo-behavior plan:drive-resilience-state-model#B-###` markers.

<!-- AC:BEGIN -->
- [x] #1 All named behavior tests for B-001 through B-021 exist with their required `@cosmo-behavior plan:drive-resilience-state-model#B-###` markers near the executable tests.
- [x] #2 The project test, lint, and typecheck gates pass for the Drive resilience changes.
- [x] #3 `cosmonauts plan check-artifacts drive-resilience-state-model` passes after behavior markers and plan artifacts are present.
- [x] #4 Regression coverage distinguishes implementation failures from finalization failures, source commits from state commits, dirty resume from pending-finalization resume, unsafe external evidence from accepted evidence, and partial-continue from all-done completion.
- [x] #5 No excluded scope from AC-019 is introduced: no parallel scheduling, per-task worktrees, tiered verification scheduling, backend prompt contract changes, artifact-conformance enforcement in Drive, final summary artifact generation, live-follow UI, automatic plan completion, push, or PR automation.
<!-- AC:END -->

## Implementation Notes

Final verification passed: `bun run test`, `bun run lint`, `bun run typecheck`, and `cosmonauts plan check-artifacts drive-resilience-state-model`. Regression/coherence pass confirmed the required distinction coverage and found no excluded AC-019 scope introduced in the Drive resilience files.
