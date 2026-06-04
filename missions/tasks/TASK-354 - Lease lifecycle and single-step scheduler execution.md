---
id: TASK-354
title: Lease lifecycle and single-step scheduler execution
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-353
createdAt: '2026-06-04T14:17:18.561Z'
updatedAt: '2026-06-04T14:35:09.529Z'
---

## Description

Implement the third spine item for plan `durable-graph-scheduler`: minimal in-process scheduler execution for one runnable step at a time, with leases, attempts, initial heartbeat, backend result handling, terminal events, and run finalization basics. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-004 is implemented and proven by `tests/durable-runtime/graph-scheduler.test.ts` > `acquires renews and releases step leases only for the matching holder`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-004`.
- [x] #2 B-013 is implemented at the sequential/single-step level and proven by `tests/durable-runtime/graph-scheduler.test.ts` > `finalizes run from terminal step outcomes without nonterminal demotion`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-013`.
- [x] #3 Single-step execution uses scheduler-typed generic backends only, persists open attempts before backend start, releases leases only after durable terminal evidence, and respects monotonic terminal run status.
- [x] #4 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
