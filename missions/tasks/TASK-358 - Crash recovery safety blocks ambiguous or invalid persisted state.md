---
id: TASK-358
title: Crash recovery safety blocks ambiguous or invalid persisted state
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-357
createdAt: '2026-06-04T14:17:55.544Z'
updatedAt: '2026-06-04T14:17:55.544Z'
---

## Description

Implement the second crash-recovery hardening slice for plan `durable-graph-scheduler`: safety behavior for committed-work windows, fresh externally-owned non-resumable work, graph-vs-step conflicts, and missing/corrupt step records. This task must remain sequential and must be green before bounded parallelism starts. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [ ] #1 B-014 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `blocks potentially committed running work without terminal attempt evidence after restart`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-014`.
- [ ] #2 B-015 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `leaves fresh nonresumable running work externally owned without starting a duplicate after restart`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-015`.
- [ ] #3 B-017 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `uses step records as mutable authority when graph step fields conflict`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-017`.
- [ ] #4 B-018 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `blocks graph steps with missing or corrupt step records before execution`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-018`.
- [ ] #5 Ambiguous or invalid persisted state produces diagnostics/blocking or externally-owned waiting without duplicate backend starts, default runnable records, overwritten corrupt evidence, or unsafe `canCommit` retries unless explicit policy opts in.
- [ ] #6 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
