---
id: TASK-348
title: Project Drive finalization phases as finalizer step records
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-347
createdAt: '2026-06-04T02:50:40.065Z'
updatedAt: '2026-06-04T03:14:11.999Z'
---

## Description

Implementation Order step 5 for durable-backend-step-model. Model existing Drive finalization phases as generic finalizer StepRecords while leaving Plan-1 normalized finalization compatibility intact. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-007` and `@cosmo-behavior plan:durable-backend-step-model#B-008` near the executable tests named in the plan.

<!-- AC:BEGIN -->
- [x] #1 B-007 is satisfied by `tests/driver/durable-finalizers.test.ts` > `projects Drive finalization phases into generic finalizer step records`, including deterministic source-commit, task-status, and state-commit finalizer step IDs, `kind: "finalizer"`, `shell-command` backend identity, commit references when available, and visible skipped reasons.
- [x] #2 B-008 is satisfied by `tests/driver/durable-finalizers.test.ts` > `records finalization_failed as a retryable finalizer step without failing the task step`, proving finalization failure creates a failed retryable finalizer StepResult with pending-finalization artifact evidence without converting the behavioral task StepRecord into a failed task solely because finalization failed.
- [x] #3 B-007 and B-008 preserve existing `DriverResult.outcome: "finalization_failed"`, pending-finalization recovery evidence, CLI status/list/resume behavior, and Plan-1 finalization normalized event shapes.
<!-- AC:END -->
