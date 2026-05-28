---
id: TASK-327
title: Record task-level commit and task-status finalization failures
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-326
createdAt: '2026-05-22T19:57:15.947Z'
updatedAt: '2026-05-26T15:08:52.925Z'
---

## Description

Implement verified-but-not-finalized task handling for source commit and task-status phases while preserving normal implementation failure semantics. Owns B-002, B-003, and B-020 from source AC-002, AC-003, AC-005, AC-018, AC-019. Seams: `lib/driver/run-one-task.ts`, `lib/driver/run-state.ts`, `lib/driver/types.ts`, `lib/driver/run-run-loop.ts`. Named tests: `tests/driver/run-one-task.test.ts` > `records finalization_failed instead of blocked when driver commit fails after passing postflight`; `records finalization_failed with commit sha when task status update fails after commit`; `does not write pending finalization for backend or postflight failures`. Tests must carry markers `@cosmo-behavior plan:drive-resilience-state-model#B-002`, `#B-003`, and `#B-020`.

<!-- AC:BEGIN -->
- [x] #1 B-002: A driver-owned source commit failure after backend success and passing postflight emits commit-failed and task-finalization-failed events, writes commit-phase pending state with `headBeforeFinalization`, returns `finalization_failed`, and does not emit `task_blocked`.
- [x] #2 B-002: The affected task is left neither `Done` nor behaviorally `Blocked`; implementation notes communicate that backend/postflight succeeded and commit finalization failed.
- [x] #3 B-003: A task-status update failure after a successful source commit emits task-status failed and task-finalization-failed events, writes pending state with required `commitSha`, returns `finalization_failed`, and does not emit `task_done`.
- [x] #4 B-020: Preflight, backend, report, and postflight failures keep existing blocked/aborted semantics and do not write pending-finalization state or final state commits.
- [x] #5 Finalization failures from this task propagate to the run-level result contract created in TASK-326.
<!-- AC:END -->

## Implementation Notes

Implemented task-level finalization failure handling for driver-owned source commit failures and post-commit task-status update failures. Added pending-finalization writes for commit and task_status phases, finalization events, non-Blocked task notes for verified commit failures, and behavior-marker coverage for B-002, B-003, and B-020. Verified with `bun run test`, `bun run typecheck`, and `bun run lint`.
