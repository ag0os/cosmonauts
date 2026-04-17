---
id: TASK-172
title: >-
  Tests: chain-runner.test.ts — Concurrency, event ordering, failure semantics,
  abort, and stats aggregation
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:chain-fanout'
dependencies:
  - TASK-167
createdAt: '2026-04-10T18:37:38.919Z'
updatedAt: '2026-04-10T19:23:20.528Z'
---

## Description

Add test coverage to `tests/orchestration/chain-runner.test.ts` for the parallel group execution path.

**Test cases to add:**
- **Concurrency:** Parallel members are started concurrently (both spawner calls made before either resolves).
- **Event ordering:** `parallel_start` is emitted before any `stage_start`; `parallel_end` is emitted after all `stage_end`/`stage_stats` events.
- **stageResults ordering:** Members appear in declaration order in `stageResults`, not completion order.
- **Failure semantics:** When one parallel member fails, `parallel_end` carries `success: false`; no subsequent chain step is started; the overall `ChainResult.success` is false.
- **All-settled semantics:** Even when one member fails, the runner waits for all started members before emitting `parallel_end`.
- **Abort signal:** When abort fires between steps, no later step starts (consistent with existing sequential abort behavior).
- **Stats aggregation:** Parallel group sums `tokens/cost/turns/toolCalls` across members but uses max member `durationMs` for the group wall-clock contribution; verify `totalDurationMs` is not the sum of member durations.

## Implementation Plan

- [x] #1 Parallel members are launched concurrently, not sequentially\n- [x] #2 parallel_start fires before member stage_start events; parallel_end fires after all member events\n- [x] #3 stageResults appends members in declaration order regardless of which finishes first\n- [x] #4 A failing member causes parallel_end with success:false and stops subsequent steps\n- [x] #5 Runner waits for all started members before reporting failure (all-settled)\n- [x] #6 Abort signal between steps prevents subsequent steps from starting\n- [x] #7 Parallel stats use sum for tokens/cost/turns/toolCalls and max for durationMs group contribution

<!-- AC:BEGIN -->
- [ ] #1 Parallel members are launched concurrently, not sequentially
- [ ] #2 parallel_start fires before member stage_start events; parallel_end fires after all member events
- [ ] #3 stageResults appends members in declaration order regardless of which finishes first
- [ ] #4 A failing member causes parallel_end with success:false and stops subsequent steps
- [ ] #5 Runner waits for all started members before reporting failure (all-settled)
- [ ] #6 Abort signal between steps prevents subsequent steps from starting
- [ ] #7 Parallel stats use sum for tokens/cost/turns/toolCalls and max for durationMs group contribution
<!-- AC:END -->

## Implementation Notes

Added 7 parallel group tests in a new `describe(\"parallel group execution\")` block at the end of the file. Each AC is covered by a dedicated test:\n\n- AC#1 (concurrency): planner blocks until worker starts its spawn; completing without deadlock proves concurrent launch.\n- AC#2 (event ordering): collects event log and asserts parallel_start < stage_start* and parallel_end > stage_end*/stage_stats*.\n- AC#3 (declaration order): worker finishes before planner; stageResults[0] is still planner.\n- AC#4 (failure semantics): planner fails → parallel_end.success=false, task-manager spawn never called, result.success=false.\n- AC#5 (all-settled): planner fails synchronously, worker blocks; a setTimeout(0) boundary lets planner's failure process while worker is still pending, then a flag checks parallel_end wasn't emitted early.\n- AC#6 (abort): both parallel members abort the controller; task-manager step is skipped by the abort check in runChain's loop.\n- AC#7 (stats): two members with seeds 1 and 2; verifies summed cost/tokens/turns/toolCalls and that totalDurationMs < sum-of-member-durationMs (group wall-clock, not sum).\n\nAlso added `ParallelGroupStep` to the types import."
