---
id: TASK-163
title: >-
  Update types.ts: Add ParallelGroupStep, ChainStep, and step-based
  ChainConfig/ChainEvent contracts
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies: []
createdAt: '2026-04-10T18:35:46.798Z'
updatedAt: '2026-04-10T18:39:45.200Z'
---

## Description

Update `lib/orchestration/types.ts` to introduce the parallel step model and update all downstream contracts that reference chain structure.

This is the foundational type change that all other tasks depend on. Every consumer — parser, runner, CLI dispatch, renderers, and tests — builds against these contracts.

**Changes required:**
- Add `ParallelGroupStep` interface with `kind: "parallel"`, a tuple-typed `stages` (minimum 2), and a discriminated union `syntax` field (`{kind: "group"}` or `{kind: "fanout"; role: string; count: number}`).
- Add `type ChainStep = ChainStage | ParallelGroupStep` union.
- Update `ChainConfig` to use `steps: ChainStep[]` (replacing the existing `stages: ChainStage[]`).
- Update `chain_start` event payload from `stages: ChainStage[]` to `steps: ChainStep[]`.
- Add `parallel_start` event: `{ type: "parallel_start"; step: ParallelGroupStep; stepIndex: number }`.
- Add `parallel_end` event: `{ type: "parallel_end"; step: ParallelGroupStep; stepIndex: number; results: StageResult[]; success: boolean; error?: string }`.
- Keep `ChainResult.stageResults` as a flat `StageResult[]` — no structural change there.
- Keep `ChainStage` unchanged as the leaf executable unit.

<!-- AC:BEGIN -->
- [ ] #1 ParallelGroupStep interface is exported from types.ts with kind, stages (min-length-2 tuple), and discriminated syntax union
- [ ] #2 ChainStep union type is exported and equals ChainStage | ParallelGroupStep
- [ ] #3 ChainConfig.steps is ChainStep[] (replacing the previous stages field)
- [ ] #4 chain_start event payload carries steps: ChainStep[]
- [ ] #5 parallel_start and parallel_end events are present in the ChainEvent union with the correct field shapes
- [ ] #6 ChainResult.stageResults remains a flat StageResult[] with no shape change
- [ ] #7 ChainStage interface is unchanged
<!-- AC:END -->

## Implementation Notes

All type changes made in lib/orchestration/types.ts. Downstream consumers (chain-runner.ts, chain-event-logger.ts, main.ts, chain-tool.ts, rendering.ts, and tests) have expected TypeScript errors from the stages→steps rename — these will be fixed in follow-up tasks. types.ts itself has no errors.
