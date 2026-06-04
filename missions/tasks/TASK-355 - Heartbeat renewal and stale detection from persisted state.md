---
id: TASK-355
title: Heartbeat renewal and stale detection from persisted state
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-354
createdAt: '2026-06-04T14:17:26.683Z'
updatedAt: '2026-06-04T14:17:26.683Z'
---

## Description

Implement the fourth spine item for plan `durable-graph-scheduler`: heartbeat renewal for active scheduler-owned work and stale classification from persisted heartbeat age before retry behavior. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is implemented and proven by `tests/durable-runtime/scheduler-heartbeats.test.ts` > `keeps long idle running steps alive while heartbeats remain fresh and no hard timeout is configured`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-005`.
- [ ] #2 B-006 is implemented and proven by `tests/durable-runtime/scheduler-recovery.test.ts` > `marks a running leased step stale from persisted heartbeat age after restart`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-006`.
- [ ] #3 Heartbeat and stale behavior is derived from persisted lease/heartbeat evidence and explicit policy; no default hard timeout or empty in-memory scheduler map fabricates stale/fresh conclusions.
- [ ] #4 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
