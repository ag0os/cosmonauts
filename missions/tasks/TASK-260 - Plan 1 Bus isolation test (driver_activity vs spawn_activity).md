---
id: TASK-260
title: 'Plan 1: Bus isolation test (driver_activity vs spawn_activity)'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-258
createdAt: '2026-05-04T17:34:27.555Z'
updatedAt: '2026-05-04T18:25:57.794Z'
---

## Description

Write the bus isolation test proving driver bus events and spawn-tool bus events are fully isolated.

See **Implementation Order step 12**, `tests/extensions/orchestration-driver-bus-isolation.test.ts` in **Files to Change**, QC-012, **D-P1-9** in `missions/plans/driver-primitives/plan.md`.

The existing `spawn_activity` subscriber at `domains/shared/extensions/orchestration/index.ts:105-126` expects `SpawnActivityEvent` shape (`spawnId`, `role`, `activity.summary`). Driver activity uses `type: "driver_activity"` with a different shape (`runId`, `parentSessionId`, `taskId`, `activity`). These must not cross-trigger.

<!-- AC:BEGIN -->
- [ ] #1 Publishing a driver_activity bus event does NOT invoke the existing spawn_activity subscriber callback.
- [ ] #2 Publishing a spawn_activity bus event (SpawnActivityEvent shape with spawnId/role) does NOT invoke the driver's driver_activity subscriber callback.
- [ ] #3 Both subscribers can be active simultaneously without interference.
- [ ] #4 tests/extensions/orchestration-driver-bus-isolation.test.ts passes under bun run test --grep 'driver bus isolation'.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
