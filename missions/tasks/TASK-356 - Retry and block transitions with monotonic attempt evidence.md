---
id: TASK-356
title: Retry and block transitions with monotonic attempt evidence
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-355
createdAt: '2026-06-04T14:17:34.367Z'
updatedAt: '2026-06-04T14:49:39.837Z'
---

## Description

Implement the fifth spine item for plan `durable-graph-scheduler`: effective retry policy, retry requeue, unknown-result blocking, and exhausted retry handling after sequential/heartbeat/stale behavior is already green. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-007 is implemented and proven by `tests/durable-runtime/scheduler-retry.test.ts` > `retries with a new attempt record and preserves prior failed attempt evidence`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-007`.
- [x] #2 B-008 is implemented and proven by `tests/durable-runtime/scheduler-retry.test.ts` > `blocks unknown results and exhausted retries instead of advancing dependents`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-008`.
- [x] #3 Retry transitions append new attempts, preserve previous evidence, never retry completed steps, and block malformed/unknown/exhausted outcomes without advancing dependents.
- [x] #4 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
