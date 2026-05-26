---
id: TASK-326
title: Define Drive finalization result and pending-state contracts
status: In Progress
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies: []
createdAt: '2026-05-22T19:57:04.624Z'
updatedAt: '2026-05-26T15:00:56.719Z'
---

## Description

Establish the shared Drive finalization vocabulary and persistence contract before behavior-specific workers build on it. Owns B-004 from source AC-004, AC-005, AC-018. Seams: `lib/driver/types.ts`, `lib/driver/run-state.ts`, `lib/driver/run-run-loop.ts`. Named test: `tests/driver/run-run-loop.test.ts` > `reports finalization_failed outcome with exact finalization details`. Tests that prove B-004 must carry marker `@cosmo-behavior plan:drive-resilience-state-model#B-004`.

<!-- AC:BEGIN -->
- [x] #1 B-004: Persisted `DriverResult` supports outcome `finalization_failed` with exact `finalizationPhase`, `finalizationReason`, optional task/commit details, and `pendingFinalizationPath`, without overloading `blockedTaskId` or `blockedReason`.
- [x] #2 B-004: Pending finalization state is represented and persisted for commit, task-status, and state-commit phases with the phase-specific required evidence from the plan contract.
- [x] #3 B-004: `runRunLoop` emits terminal `run_finalization_failed` and persists the finalization-failed completion result when task execution or final state persistence reports finalization failure.
- [x] #4 Existing completed, blocked, and aborted result shapes remain compatible for non-finalization outcomes.
<!-- AC:END -->

## Implementation Notes

AC #1 satisfied: DriverResult now includes finalization_failed with finalization details and pendingFinalizationPath, separate from blocked fields.
AC #2 satisfied: PendingFinalizationState is a phase-discriminated persisted contract for commit, task_status, and state_commit evidence with read/write/clear helpers.
AC #3 satisfied: runRunLoop emits run_finalization_failed, returns and writes finalization_failed completion for task finalization failures.
AC #4 satisfied: existing completed/blocked/aborted result compatibility is preserved, including partial-continue blockedTaskId behavior.
