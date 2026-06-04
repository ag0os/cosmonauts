---
id: TASK-359
title: Bounded parallelism after sequential recovery safety
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-358
createdAt: '2026-06-04T14:18:04.508Z'
updatedAt: '2026-06-04T14:18:04.508Z'
---

## Description

Implement the bounded parallelism spine item for plan `durable-graph-scheduler` only after sequential scheduling, leases, heartbeats, stale detection, retry/block, and crash-recovery safety are green. Scope is scheduler-local concurrency limiting and shared-worktree safety diagnostics in `lib/durable-runtime/`; do not import chain/orchestration semaphores if that violates durable-runtime dependency direction. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [ ] #1 B-012 is implemented and proven by `tests/durable-runtime/scheduler-parallelism.test.ts` > `defaults to one running step and never exceeds explicit maxParallelSteps`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-012`.
- [ ] #2 B-016 is implemented and proven by `tests/durable-runtime/scheduler-parallelism.test.ts` > `caps shared-worktree committing backends to sequential while isolated non-committing backends run in parallel`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-016`.
- [ ] #3 Effective active backend count never exceeds policy, defaults to sequential, and shared-worktree committing backends are capped/diagnosed without introducing per-step worktree or merge behavior.
- [ ] #4 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
