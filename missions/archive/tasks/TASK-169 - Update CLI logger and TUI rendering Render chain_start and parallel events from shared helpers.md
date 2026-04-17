---
id: TASK-169
title: >-
  Update CLI logger and TUI rendering: Render chain_start and parallel events
  from shared helpers
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
  - TASK-164
createdAt: '2026-04-10T18:37:03.076Z'
updatedAt: '2026-04-10T18:52:04.146Z'
---

## Description

Update `cli/chain-event-logger.ts` and `domains/shared/extensions/orchestration/rendering.ts` to handle the new step-based event contracts and `parallel_start`/`parallel_end` events. Both must use the shared `formatChainSteps()` helper from `chain-steps.ts` so they render identically.

**cli/chain-event-logger.ts changes:**
- The `chain_start` handler currently maps `ChainStage[]` (lines 25–35) — update it to call `formatChainSteps(event.steps)` from `chain-steps.ts`.
- Add handlers for `parallel_start` and `parallel_end` events that log appropriate progress lines (e.g. starting group members, pass/fail outcome).

**domains/shared/extensions/orchestration/rendering.ts changes:**
- The TUI progress handler for `chain_start` currently maps `ChainStage[]` (lines 79–81) — update to use `formatChainSteps(event.steps)`.
- Add TUI rendering for `parallel_start` (show which members are starting) and `parallel_end` (show pass/fail for the group).

**Constraint:** Neither file should re-implement DSL formatting or parallel-shape detection — both must delegate to the shared helpers in `chain-steps.ts`.

<!-- AC:BEGIN -->
- [ ] #1 chain-event-logger.ts uses formatChainSteps from chain-steps.ts for chain_start display
- [ ] #2 chain-event-logger.ts handles parallel_start and parallel_end events with meaningful log output
- [ ] #3 rendering.ts uses formatChainSteps from chain-steps.ts for chain_start TUI display
- [ ] #4 rendering.ts handles parallel_start and parallel_end events with meaningful TUI progress output
- [ ] #5 Neither file contains its own DSL formatting logic or parallel-shape detection
<!-- AC:END -->

## Implementation Notes

Updated chain-event-logger.ts: removed local formatPipeline, imported formatChainSteps from chain-steps.ts, updated chain_start case, added parallel_start and parallel_end cases. Updated rendering.ts: imported formatChainSteps, updated chain_start TUI line, added parallel_start/end cases. Updated test file to use new steps API and added tests for all new parallel events. All 19 tests pass, no lint/typecheck errors in modified files.
