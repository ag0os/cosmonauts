---
id: TASK-350
title: Protect legacy observation surfaces and document Plan-2 step model
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-349
createdAt: '2026-06-04T02:50:57.809Z'
updatedAt: '2026-06-04T03:26:07.517Z'
---

## Description

Implementation Order step 7 for durable-backend-step-model. Prove step records coexist with existing observation tools without new CLI/tool fields, then document the Plan-2 backend/step/finalizer model. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-011` near the executable test named in the plan.

<!-- AC:BEGIN -->
- [x] #1 B-011 is satisfied by `tests/driver/driver-durable-steps.test.ts` > `keeps legacy observation outputs unchanged when step records exist`, proving `watch_events`, Drive status, and Drive list continue to observe legacy state/events and do not read step records or gain step-record-derived fields.
- [x] #2 B-011 preserves `run_watch` and `run_status` summarization from normalized events via `RunRecord.eventsPath`, with only the explicit B-006 malformed-report unknown-result correction reflected in normalized task completion results.
- [x] #3 The Plan-2 documentation in `lib/driver/README.md` describes the backend wrapper, authoritative configured backend identity rule, step/attempt layout, D-006 unknown result rule, normalized-event correction, finalizer-step recovery model, and finalization normalized-event compatibility exception.
<!-- AC:END -->
