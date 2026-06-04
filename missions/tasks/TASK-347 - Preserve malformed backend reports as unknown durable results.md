---
id: TASK-347
title: Preserve malformed backend reports as unknown durable results
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-346
createdAt: '2026-06-04T02:50:32.165Z'
updatedAt: '2026-06-04T02:50:32.165Z'
---

## Description

Implementation Order step 4 for durable-backend-step-model. Enforce architecture D-006 in durable task results and actual normalized task completion events while keeping Drive CLI/task outcomes unchanged. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-006` near the executable test named in the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is satisfied by `tests/driver/driver-durable-steps.test.ts` > `records malformed reports as completed unknown in step records and normalized events`, proving malformed/missing backend reports persist `StepResult.outcome: "unknown"` in attempt result, task StepRecord result, and actual normalized `step_completed.result`.
- [ ] #2 B-006 preserves Drive lifecycle compatibility by allowing legacy `task_done` to set task StepRecord status to `completed` without converting the durable result to success or setting `nextAction: "continue"`.
- [ ] #3 B-006 result mapping keeps parsed-report file/verification vocabularies distinct from legacy `verify` event vocabularies and does not fabricate unavailable evidence or change current Drive CLI/task outcomes.
<!-- AC:END -->
