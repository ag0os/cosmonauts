---
id: TASK-334
title: >-
  Emit plan completion candidates and skip run-level finalization for
  partial-continue runs
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-330
  - TASK-333
createdAt: '2026-05-22T19:58:18.490Z'
updatedAt: '2026-05-26T16:05:03.603Z'
---

## Description

Finish run-level success semantics after task/status/state finalization, including all-plan-done evidence and partial-continue exclusions. Owns B-018 and B-019 from source AC-015, AC-016, AC-018, AC-019. Seams: `lib/driver/run-run-loop.ts`, `lib/driver/types.ts`, `domains/shared/extensions/orchestration/watch-events-tool.ts`. Named tests: `tests/driver/run-run-loop.test.ts` > `emits plan completion candidate without editing the plan when all plan tasks are done`; `skips final state commit and completion candidate for partial continue runs`. Tests must carry markers `@cosmo-behavior plan:drive-resilience-state-model#B-018` and `#B-019`.

<!-- AC:BEGIN -->
- [x] #1 B-018: After successful task/status/state finalization, Drive emits `plan_completion_candidate` with plan slug, task count, and reason when every task labeled `plan:<slug>` is `Done`.
- [x] #2 B-018: Emitting a plan completion candidate does not edit `missions/plans/<slug>/plan.md`, call plan lifecycle automation, archive, distill memory, push, or open PRs.
- [x] #3 B-019: When `partialMode=continue` leaves any queued task not done, existing run completion summary semantics remain but final state commit is skipped with reason `not_all_tasks_done`.
- [x] #4 B-019: Partial-continue and other not-all-done runs do not emit `plan_completion_candidate`.
- [x] #5 Plan completion candidate events remain visible through the event surfaces updated in TASK-333.
<!-- AC:END -->

## Implementation Notes

Implemented B-018/B-019: run loop emits plan_completion_candidate only after successful run finalization when all tasks labeled plan:<slug> are Done; partial-continue not-all-done runs preserve completed summary semantics while skipping state commit with not_all_tasks_done and emit no candidate; watch_events renders candidate reason.
