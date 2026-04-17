---
id: TASK-164
title: >-
  Create chain-steps.ts: Shared ChainStep helpers (type guards, formatter, DSL
  detection, prompt injection)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
createdAt: '2026-04-10T18:36:02.589Z'
updatedAt: '2026-04-10T18:48:18.651Z'
---

## Description

Create `lib/orchestration/chain-steps.ts` as the new shared helper module that parser, runner, CLI dispatch, and renderers all import from. This module must not duplicate logic across those consumers.

**Exports required:**
- `isParallelGroupStep(step: ChainStep): step is ParallelGroupStep` — type guard.
- `isChainStage(step: ChainStep): step is ChainStage` — type guard.
- `getFirstExecutableStages(steps: ChainStep[]): ChainStage[]` — returns member stages of the first step (one element for sequential, all members for parallel). Used for prompt injection.
- `injectUserPrompt(steps: ChainStep[], prompt?: string): void` — mutates the first step: if sequential, injects into that single stage; if parallel, appends to every member of that first step.
- `formatChainSteps(steps: ChainStep[]): string` — produces a DSL string representation (e.g. `planner -> [task-manager, reviewer]`, `reviewer[2]`). Used by renderers/logger instead of each inventing their own format.
- `isChainDslExpression(expression: string): boolean` — returns true for any structurally valid chain input: a single stage name, a single `role[n]` fanout, a single `[a, b]` group, or any `->` separated chain. Used by `cli/main.ts` to replace the `includes("->")` heuristic.

**Constraints:**
- Depends only on `types.ts`. No imports from parser, runner, or CLI modules.
- `isChainDslExpression` must accept `reviewer[2]`, `[planner, reviewer]`, `planner -> [task-manager, reviewer]`, and plain `planner` as valid expressions.

## Implementation Plan

All ACs satisfied:
#1 isParallelGroupStep and isChainStage exported with correct narrowing
#2 injectUserPrompt handles sequential (one stage) and parallel (all members)
#3 formatChainSteps renders sequential, group, fanout, and mixed chains
#4 isChainDslExpression returns true for single stage, fanout, bracket group, arrow chains
#5 isChainDslExpression returns false for plan-and-build (compound workflow name) and empty/whitespace
#6 Module imports only from types.ts

<!-- AC:BEGIN -->
- [ ] #1 isParallelGroupStep and isChainStage type guards are exported and correctly narrow ChainStep
- [ ] #2 injectUserPrompt injects into one stage when first step is sequential, or into all members when first step is parallel
- [ ] #3 formatChainSteps produces correct DSL strings for sequential, group, fanout, and mixed chains
- [ ] #4 isChainDslExpression returns true for a single stage name, single fanout, single bracket group, and multi-step arrow expressions
- [ ] #5 isChainDslExpression returns false for inputs that are clearly workflow names (no arrows, brackets, or fanout syntax)
- [ ] #6 Module only imports from types.ts — no circular dependencies
<!-- AC:END -->

## Implementation Notes

Created lib/orchestration/chain-steps.ts with all six exports. Tests in tests/orchestration/chain-steps.test.ts (46 passing). isChainDslExpression uses a structural heuristic: strings with `->`, `[`, or `]` are always DSL; simple single-segment identifiers (at most one hyphen per path segment) are treated as stage names and return true; compound names like `plan-and-build` (two or more hyphens) return false. injectUserPrompt stores the user prompt directly in stage.prompt (appending if already set) without referencing getDefaultStagePrompt — chain-runner.ts (TASK-167) will combine this with the default prompt when building stage prompts. Pre-existing typecheck errors in chain-runner.ts, cli/main.ts, etc. are from the TASK-163 stages→steps rename and are out of scope.
