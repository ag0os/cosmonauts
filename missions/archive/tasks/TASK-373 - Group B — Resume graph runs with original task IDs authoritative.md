---
id: TASK-373
title: Group B — Resume graph runs with original task IDs authoritative
status: Done
priority: medium
labels:
  - 'group:b'
  - backend
  - cli
  - testing
  - drive
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-372
createdAt: '2026-06-04T20:48:54.508Z'
updatedAt: '2026-06-04T22:34:16.918Z'
---

## Description

Owns Group B Implementation Order step 13. Worker should implement B-020 test-first and place `@cosmo-behavior plan:durable-frontend-migration#B-020` near the executable test. Scope is graph resume state, pending-finalization retry ordering, dirty-worktree behavior, external state-commit acceptance, and the original-vs-remaining task ID boundary.

<!-- AC:BEGIN -->
- [x] #1 B-020 is proven by `tests/cli/drive/graph-resume.test.ts` > `resumes graph runs without rewriting original selected task ids`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-020`.
- [x] #2 `loadResumeDefaults` exposes original selected task IDs separately from legacy remaining task IDs, and graph resume keeps `spec.taskIds` and `RunRecord.metadata.driveTaskIds` as the authoritative original selected set.
- [x] #3 The legacy remaining queue is used only as a compatibility view and never drives graph compilation, finalizer dependencies, backend task validation, all-task completion accounting, or completion summaries.
- [x] #4 Pending finalization is retried before backend work, remains authoritative until cleared, and a resume case with no remaining queue work but incomplete final state commit still runs graph/finalizer recovery against the original task IDs.
- [x] #5 Completed task and finalizer steps are not duplicated on resume, external state-commit acceptance still works, and `--resume-dirty` preserves its current override behavior.
- [x] #6 Project-native tests for touched graph resume behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
