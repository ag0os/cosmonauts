---
id: TASK-352
title: Durable graph scheduler contracts and store primitives
status: Done
priority: high
labels:
  - backend
  - testing
  - database
  - 'plan:durable-graph-scheduler'
dependencies: []
createdAt: '2026-06-04T14:17:02.653Z'
updatedAt: '2026-06-04T14:25:32.965Z'
---

## Description

Implement the first spine item for plan `durable-graph-scheduler`: scheduler public contracts, canonical status compatibility, store-owned graph/scheduler/heartbeat/diagnostic primitives, and scheduler backend typing. Scope is limited to `lib/durable-runtime/` contracts/store/export seams and referenced tests. Preserve non-goals: no Drive/chain graph compiler, no daemon/distributed scheduler, no per-step worktree creation/merge, no mutating controller, and no scheduler persistence outside `RunStore`/`FileRunStore`. Planned-behavior tests must be written test-first and carry exact `@cosmo-behavior plan:durable-graph-scheduler#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-001 is implemented and proven by `tests/durable-runtime/scheduler-contracts.test.ts` > `extends scheduler contracts without renaming durable runtime fields or statuses`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-001`.
- [x] #2 B-002 is implemented and proven by `tests/durable-runtime/scheduler-store.test.ts` > `persists graph scheduler state leases heartbeats and diagnostics through the store`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-002`.
- [x] #3 B-020 is implemented and proven by `tests/durable-runtime/scheduler-contracts.test.ts` > `does not accept Drive orchestration adapters without a Plan 4 BackendInvocation builder`, including marker `@cosmo-behavior plan:durable-graph-scheduler#B-020`.
- [x] #4 Existing Plan-1/Plan-2 durable-runtime contracts remain compatible: no status-union drift, no Drive adapter registration erasure, and scheduler persistence goes only through `RunStore`/`FileRunStore`.
- [x] #5 The project's configured test, lint, and typecheck gates pass for the resulting change.
<!-- AC:END -->
