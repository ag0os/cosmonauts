---
id: TASK-166
title: >-
  Update cli/main.ts: Replace includes("->") heuristic with syntax-aware DSL
  detection
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-164
createdAt: '2026-04-10T18:36:24.417Z'
updatedAt: '2026-04-10T18:50:56.561Z'
---

## Description

Replace the ad-hoc raw-DSL detection in `cli/main.ts` (currently `options.workflow.includes("->")` at line 353–357) with the shared `isChainDslExpression()` helper from `chain-steps.ts`.

**Changes required:**
- Import `isChainDslExpression` from `lib/orchestration/chain-steps.ts`.
- Replace the `includes("->")` guard with `isChainDslExpression(options.workflow)` so that single-step expressions like `reviewer[2]` and `[planner, reviewer]` are correctly routed to `parseChain()` instead of `resolveWorkflow()`.
- Update CLI help text and `--workflow` option examples to include at least one fan-out and one bracket-group example.
- Workflow-name resolution remains the fallback when `isChainDslExpression` returns false.

<!-- AC:BEGIN -->
- [ ] #1 cli/main.ts no longer uses includes('->') for DSL detection
- [ ] #2 isChainDslExpression from chain-steps.ts is used as the routing guard for the --workflow flag
- [ ] #3 reviewer[2] is routed to parseChain() not resolveWorkflow()
- [ ] #4 [planner, reviewer] is routed to parseChain() not resolveWorkflow()
- [ ] #5 A plain workflow name that is not DSL still routes to resolveWorkflow()
- [ ] #6 CLI help or usage examples include at least one fanout and one bracket-group example
<!-- AC:END -->

## Implementation Notes

Replaced `options.workflow.includes('->')` with `isChainDslExpression(options.workflow)` imported from `lib/orchestration/chain-steps.ts`. This correctly routes fan-out (`reviewer[2]`) and bracket-group (`[planner, reviewer]`) expressions to `parseChain()` instead of `resolveWorkflow()`. Updated `--workflow` option description and file header comment to include fanout and bracket-group examples. All 506 tests pass. Pre-existing typecheck errors (unrelated `stages` vs `steps` rename) were present before this change.
