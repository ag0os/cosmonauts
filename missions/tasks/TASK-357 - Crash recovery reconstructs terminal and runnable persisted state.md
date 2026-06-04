---
id: TASK-357
title: Crash recovery reconstructs terminal and runnable persisted state
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-356
createdAt: '2026-06-04T14:17:43.449Z'
updatedAt: '2026-06-04T17:08:35.889Z'
---

## Description

Implement the first crash-recovery hardening slice for plan `durable-graph-scheduler`: recovery entry loads persisted graph topology, step records, scheduler state, heartbeat files, and attempts before selecting work. This task must be green before any bounded parallelism work. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-009 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `does not rerun completed steps when restarted with empty in-memory state`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-009`.
- [x] #2 B-010 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `reconstructs ready queue leases and heartbeats from persisted records after restart`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-010`.
- [x] #3 B-011 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `promotes terminal attempt results on restart without starting a duplicate backend`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-011`.
- [x] #4 Recovery trusts persisted terminal step/attempt evidence over empty in-memory maps or stale scheduler snapshots and never starts duplicate backend work before reconciliation completes.
- [x] #5 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
