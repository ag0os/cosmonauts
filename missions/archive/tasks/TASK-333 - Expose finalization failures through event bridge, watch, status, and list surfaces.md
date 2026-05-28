---
id: TASK-333
title: >-
  Expose finalization failures through event bridge, watch, status, and list
  surfaces
status: Done
priority: medium
assignee: worker
labels:
  - api
  - backend
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-326
  - TASK-330
createdAt: '2026-05-22T19:58:10.478Z'
updatedAt: '2026-05-26T16:00:34.582Z'
---

## Description

Update operator-facing event and run-inspection surfaces for finalization-specific outcomes. Owns B-009, B-010, and B-011 from source AC-005, AC-006, AC-017. Seams: `domains/shared/extensions/orchestration/watch-events-tool.ts`, `lib/driver/event-stream.ts`, `cli/drive/subcommand.ts`. Named tests: `tests/extensions/orchestration-watch-events.test.ts` > `summarizes finalization phase failures and no-change commits distinctly from task blocks`; `tests/driver/event-stream.test.ts` > `bridges run_finalization_failed and treats it as terminal`; `tests/cli/drive/status.test.ts` > `reports finalization_failed completion details`; `tests/cli/drive/list.test.ts` > `lists finalization_failed runs`. Tests must carry markers for B-009, B-010, and B-011.

<!-- AC:BEGIN -->
- [x] #1 B-009: `watch_events` produces compact one-line summaries that distinguish commit failure, no-source-change commit skip, state commit failure, and run finalization failure from task blocks.
- [x] #2 B-010: `run_finalization_failed` is bridged to the activity bus and treated as a terminal event alongside `run_completed` and `run_aborted`.
- [x] #3 B-010: `task_finalization_failed` and `plan_completion_candidate` events are bridgeable without breaking existing detached event bridge behavior.
- [x] #4 B-011: `cosmonauts drive status` JSON reports `finalization_failed` completion status with the exact finalization details from `DriverResult`.
- [x] #5 B-011: `cosmonauts drive list` includes finalization-failed runs and exposes their finalization details without blocked-field overload.
- [x] #6 Existing status/list/watch output for completed, blocked, aborted, and partial runs remains compatible except for additive finalization summaries.
<!-- AC:END -->

## Implementation Notes

Verified prior implementation for B-009/B-010/B-011 on branch drive-resilience-state-model. Confirmed exact behavior markers and named tests are present; watch_events finalization summaries, event bridge terminal/bridgeable finalization events, and status/list finalization_failed JSON details satisfy all ACs. Verification run: targeted Vitest files for watch/event-stream/status/list passed; full `bun run test` passed; `bun run lint` passed; `bun run typecheck` passed. Existing commit: 2f979c5 TASK-333: Expose Drive finalization failures.
