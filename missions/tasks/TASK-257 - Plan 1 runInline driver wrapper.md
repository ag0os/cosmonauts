---
id: TASK-257
title: 'Plan 1: runInline driver wrapper'
status: To Do
priority: medium
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-252
  - TASK-253
  - TASK-256
createdAt: '2026-05-04T17:33:56.108Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Implement `lib/driver/driver.ts` (`runInline`) and `tests/driver/driver.test.ts`.

See **Implementation Order step 9**, **D-P1-11**, **D-P1-3**, **Key contracts > driver.ts**, **Files to Change** in `missions/plans/driver-primitives/plan.md`.

`runInline` is a thin wrapper: acquires plan lock → creates EventSink → calls `runRunLoop` (not awaited — fire-and-continue) → releases lock in `finally`. It returns a `DriverHandle` immediately.

Note: `runRunLoop` is the exported loop body (TASK-256). `runInline` is the inline entry point only; Plan 3's binary calls `runRunLoop` directly after acquiring its own lock.

<!-- AC:BEGIN -->
- [ ] #1 runInline(spec: DriverRunSpec, deps: DriverDeps): DriverHandle is exported from lib/driver/driver.ts.
- [ ] #2 Acquires plan lock via acquirePlanLock before starting the loop; returns {error:'active'} (or rejects) for concurrent same-planSlug invocations.
- [ ] #3 Creates EventSink via createEventSink using spec.eventLogPath, spec.runId, spec.parentSessionId, and deps.activityBus.
- [ ] #4 Calls runRunLoop without top-level await; DriverHandle.result resolves when runRunLoop settles.
- [ ] #5 Plan lock is released in a finally block after runRunLoop resolves (success or failure).
- [ ] #6 DriverHandle carries: runId, planSlug, workdir, eventLogPath, abort(), result.
- [ ] #7 tests/driver/driver.test.ts verifies lock acquired+released, concurrent invocation rejected, and all handle fields; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
