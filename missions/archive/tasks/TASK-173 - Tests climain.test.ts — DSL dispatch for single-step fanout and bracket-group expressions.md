---
id: TASK-173
title: >-
  Tests: cli/main.test.ts — DSL dispatch for single-step fanout and
  bracket-group expressions
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:chain-fanout'
dependencies:
  - TASK-166
createdAt: '2026-04-10T18:37:46.316Z'
updatedAt: '2026-04-10T19:02:27.286Z'
---

## Description

Add test coverage to `tests/cli/main.test.ts` for the updated raw-DSL dispatch logic in `cli/main.ts`.

**Test cases to add:**
- `reviewer[2]` as `--workflow` value is routed to `parseChain()`, not `resolveWorkflow()`.
- `[planner, reviewer]` as `--workflow` value is routed to `parseChain()`, not `resolveWorkflow()`.
- `planner -> [task-manager, reviewer]` as `--workflow` value is routed to `parseChain()`.
- A plain workflow name (e.g. `my-workflow`) that is not DSL is still routed to `resolveWorkflow()`.
- Existing multi-step sequential DSL (e.g. `planner -> reviewer`) continues to route to `parseChain()`.

## Implementation Plan

- [x] #1 reviewer[2] dispatches to parseChain not resolveWorkflow\n- [x] #2 [planner, reviewer] dispatches to parseChain not resolveWorkflow\n- [x] #3 A plain workflow name dispatches to resolveWorkflow not parseChain\n- [x] #4 Existing sequential DSL continues to dispatch to parseChain\n- [x] #5 Tests are in tests/cli/main.test.ts and pass with bun run test

<!-- AC:BEGIN -->
- [ ] #1 reviewer[2] dispatches to parseChain not resolveWorkflow
- [ ] #2 [planner, reviewer] dispatches to parseChain not resolveWorkflow
- [ ] #3 A plain workflow name dispatches to resolveWorkflow not parseChain
- [ ] #4 Existing sequential DSL continues to dispatch to parseChain
- [ ] #5 Tests are in tests/cli/main.test.ts and pass with bun run test
<!-- AC:END -->

## Implementation Notes

Added a `--workflow DSL dispatch routing` describe block to `tests/cli/main.test.ts` (lines ~160-210). The block imports `isChainDslExpression` from `lib/orchestration/chain-steps.ts` (the actual routing guard used in `cli/main.ts run()`) and tests each dispatch case: fanout `reviewer[2]` → true, bracket-group `[planner, reviewer]` → true, mixed chain `planner -> [task-manager, reviewer]` → true, compound workflow name `plan-and-build` → false (routes to resolveWorkflow), sequential chain `planner -> reviewer` → true. Also added two `parseCliArgs` tests for the new DSL forms (fanout and bracket-group) to verify the CLI layer preserves these values. 62 tests pass total (+6 new)."
