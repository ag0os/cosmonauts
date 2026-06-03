---
id: TASK-341
title: Add Drive event normalization adapter
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-340
createdAt: '2026-06-03T21:58:02.588Z'
updatedAt: '2026-06-03T21:58:02.588Z'
---

## Description

Implementation Order step 5. Implement the Drive compatibility adapter that translates legacy `DriverEvent`s into canonical durable-runtime events after read-only runtime surfaces are in place. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named tests from the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is covered by `tests/driver/durable-events.test.ts` > `maps driver lifecycle events without fabricating backend or step data`: representative Drive lifecycle/task/backend/finalization/terminal/advisory events map to architecture-canonical `OrchestrationEvent` shapes, preserve canonical terminal field sets, and mark advisory events with no normalized variant as legacy-only rather than fabricating step/backend/details/result data.
- [ ] #2 B-005 is covered by `tests/driver/durable-events.test.ts` > `preserves reports activity commits and finalization details without extending terminal events`: Drive/backend-specific reports, activity, commits, finalization evidence, contradicted-block annotations, retryability evidence, and unknown reports survive in activity/artifact/completed-result/diagnostic surfaces while canonical failed/blocked terminal events remain Drive-field-free.
- [ ] #3 B-015 is covered by `tests/driver/durable-events.test.ts` > `maps failed preflight to activity detail followed by canonical step blocked`: failed preflight events emit preflight activity detail followed by canonical `step_blocked` with only `reason`, leaving no normalized `step_ready` dangling; started/passed preflight events may emit activity detail but no terminal step event.
<!-- AC:END -->
