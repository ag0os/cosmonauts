---
id: TASK-346
title: Project Drive task execution into durable step records
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-345
createdAt: '2026-06-04T02:50:25.799Z'
updatedAt: '2026-06-04T02:50:25.799Z'
---

## Description

Implementation Order step 3 for durable-backend-step-model. Add the Drive-specific task step projector and integrate it after legacy event write/publish so current Drive behavior and event compatibility remain owned by Drive. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-004` and `@cosmo-behavior plan:durable-backend-step-model#B-005` near the executable tests named in the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is satisfied by `tests/driver/driver-durable-steps.test.ts` > `writes Drive task step records with configured backend identity and resume-safe dependencies`, including task step records with configured `DriverRunSpec.backendName`, original task-order dependencies from run metadata across resume, deterministic available input/output artifacts, current status, latest attempt, terminal result, and diagnostics for configured-vs-observed backend mismatches.
- [ ] #2 B-004 preserves compatibility of legacy Drive events and normalized event dual-write while recording fake/programmatic backend telemetry only as diagnostic/evidence, never as persisted StepRecord backend identity.
- [ ] #3 B-005 is satisfied by `tests/driver/durable-steps.test.ts` > `appends a new attempt when Drive retries a task`, proving Drive retry sequences append readable attempt evidence, preserve prior attempts, update `latestAttemptId`, and keep the task StepResult aligned with the latest terminal attempt.
<!-- AC:END -->
