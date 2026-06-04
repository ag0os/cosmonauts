---
id: TASK-353
title: Pure sequential graph readiness reconciliation
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-352
createdAt: '2026-06-04T14:17:10.561Z'
updatedAt: '2026-06-04T14:17:10.561Z'
---

## Description

Implement the second spine item for plan `durable-graph-scheduler`: pure sequential dependency readiness in the scheduler-state seam before backend execution complexity. Scope is `lib/durable-runtime/scheduler-state.ts`, the minimal scheduler/store integration needed to observe readiness, and referenced tests. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [ ] #1 B-003 is implemented and proven by `tests/durable-runtime/graph-scheduler.test.ts` > `marks dependency-satisfied steps ready and leaves blocked dependencies pending`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-003`.
- [ ] #2 Sequential readiness is recomputed from persisted step state and dependencies, emits `step_ready` exactly once per ready transition, and never requeues completed steps.
- [ ] #3 The scheduler-state seam remains pure durable-runtime logic with no filesystem, backend, Drive, CLI, domains, prompt, task, or orchestration imports.
- [ ] #4 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
