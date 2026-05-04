---
id: TASK-257
title: 'Plan 1: runInline driver wrapper'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-252
  - TASK-253
  - TASK-256
createdAt: '2026-05-04T17:33:56.108Z'
updatedAt: '2026-05-04T19:36:38.314Z'
---

## Description

Implement `lib/driver/driver.ts` (`runInline`) and `tests/driver/driver.test.ts`.

See **Implementation Order step 9**, **D-P1-11**, **D-P1-3**, **Key contracts > driver.ts**, **Files to Change** in `missions/plans/driver-primitives/plan.md`.

`runInline` is a thin wrapper: acquires plan lock → creates EventSink → calls `runRunLoop` (not awaited — fire-and-continue) → releases lock in `finally`. It returns a `DriverHandle` immediately.

Note: `runRunLoop` is the exported loop body (TASK-256). `runInline` is the inline entry point only; Plan 3's binary calls `runRunLoop` directly after acquiring its own lock.

<!-- AC:BEGIN -->
- [x] #1 runInline(spec: DriverRunSpec, deps: DriverDeps): DriverHandle is exported from lib/driver/driver.ts.
- [x] #2 Acquires plan lock via acquirePlanLock before starting the loop; returns {error:'active'} (or rejects) for concurrent same-planSlug invocations.
- [x] #3 Creates EventSink via createEventSink using spec.eventLogPath, spec.runId, spec.parentSessionId, and deps.activityBus.
- [x] #4 Calls runRunLoop without top-level await; DriverHandle.result resolves when runRunLoop settles.
- [x] #5 Plan lock is released in a finally block after runRunLoop resolves (success or failure).
- [x] #6 DriverHandle carries: runId, planSlug, workdir, eventLogPath, abort(), result.
- [x] #7 tests/driver/driver.test.ts verifies lock acquired+released, concurrent invocation rejected, and all handle fields; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Implemented runInline in lib/driver/driver.ts and tests/driver/driver.test.ts. Active plan lock conflicts are surfaced by rejecting DriverHandle.result so runInline remains a synchronous DriverHandle-returning wrapper per plan.md. Verified: test -f lib/driver/driver.ts, bun run test --grep "driver", bun run typecheck, bun run lint. Committed as 6fddbe5.
