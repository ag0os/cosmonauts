---
id: TASK-360
title: Signal cancellation and full durable scheduler verification
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-graph-scheduler'
dependencies:
  - TASK-359
createdAt: '2026-06-04T14:18:14.777Z'
updatedAt: '2026-06-04T17:24:16.523Z'
---

## Description

Implement the final spine item for plan `durable-graph-scheduler`: invocation-local scheduler signal cancellation plus compatibility/full verification after bounded parallelism is complete. Scope remains `lib/durable-runtime/` scheduler behavior and referenced durable-runtime tests. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-019 is implemented and proven by `tests/durable-runtime/scheduler-cancellation.test.ts` > `cancels active backend on signal and preserves running evidence when cancellation is unsupported`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-019`.
- [x] #2 Signal cancellation persists confirmed cancellation evidence and releases leases only when supported, while unsupported cancellation preserves running lease/heartbeat/open-attempt evidence without starting replacements.
- [x] #3 All targeted scheduler tests, existing durable-runtime tests, and the repository's configured test, lint, and typecheck gates pass after the full plan implementation.
- [x] #4 Every referenced `tests/durable-runtime/*.test.ts` planned-behavior test contains the exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` marker for its owned behaviors.
- [x] #5 `plan check-artifacts durable-graph-scheduler` passes once all marker'd tests exist.
<!-- AC:END -->
