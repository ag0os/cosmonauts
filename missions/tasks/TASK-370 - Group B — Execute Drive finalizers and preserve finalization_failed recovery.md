---
id: TASK-370
title: Group B — Execute Drive finalizers and preserve finalization_failed recovery
status: To Do
priority: medium
labels:
  - 'group:b'
  - backend
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-369
createdAt: '2026-06-04T20:48:26.480Z'
updatedAt: '2026-06-04T20:48:26.480Z'
---

## Description

Owns Group B Implementation Order step 10. Worker should implement B-014 and B-015 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. Scope is the Drive-specific shell-command finalizer backend, shared Drive finalization helpers, and persisted-evidence mapping for retryable finalization failures.

<!-- AC:BEGIN -->
- [ ] #1 B-014 is proven by `tests/driver/shell-command-finalizer.test.ts` > `commits source changes and marks task status through shell finalizer steps`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-014`.
- [ ] #2 B-015 is proven by `tests/driver/shell-command-finalizer.test.ts` > `records retryable finalizer failures from persisted attempt evidence as finalization_failed`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-015`.
- [ ] #3 Source-commit and task-status finalizers preserve today's commit subject/exclusion behavior, task `Done` transition behavior, legacy `finalize`/`commit_made`/`task_done` events, and commit artifacts in finalizer results when commits are created.
- [ ] #4 Retryable source-commit, task-status, or state-commit finalizer failures write `pending-finalization.json` with current phase-specific fields and retain `nextAction: "retry"` in both latest attempt evidence and persisted `StepRecord.result` after scheduler transition.
- [ ] #5 `runDriveOnGraph` finalization-failed mapping is based on persisted finalizer evidence plus `pending-finalization.json`, not in-memory scheduler state, and task steps are not converted into behavioral task failures.
- [ ] #6 Project-native tests for the touched finalizer behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
