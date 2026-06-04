---
id: TASK-349
title: Append finalizer retry attempts and isolate durable step write failures
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-backend-step-model'
dependencies:
  - TASK-348
createdAt: '2026-06-04T02:50:48.134Z'
updatedAt: '2026-06-04T02:50:48.134Z'
---

## Description

Implementation Order step 6 for durable-backend-step-model. Cover Drive resume finalization retry paths and failure isolation after task/finalizer projection is in place. Workers must implement tests first and place `@cosmo-behavior plan:durable-backend-step-model#B-009` and `@cosmo-behavior plan:durable-backend-step-model#B-010` near the executable tests named in the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-009 is satisfied by `tests/cli/drive/run.test.ts` > `resume records source task-status and state-commit finalizer retry failures as attempts`, proving resume invokes no backend task work before pending finalization recovery, preserves existing pending-finalization success/failure behavior, keeps failed finalizer attempts on disk, and appends new finalizer attempts for success or retryable failure.
- [ ] #2 B-009 covers durable-only finalizer failure recording for source-commit, task-status, and state-commit resume failures that currently emit no terminal legacy DriverEvent, including `acceptExternalStateCommit` rejection paths for pending task not Done, dirty pending task files, and unchanged HEAD after no-changes state commit retry.
- [ ] #3 B-010 is satisfied by `tests/driver/driver-durable-steps.test.ts` > `continues Drive run when durable step persistence fails`, proving step/attempt write failures are diagnostic-only and do not change legacy events, activity-bus publication, normalized event writes, task updates, commits, pending finalization, DriverResult, or in-memory D-006 result context.
<!-- AC:END -->
