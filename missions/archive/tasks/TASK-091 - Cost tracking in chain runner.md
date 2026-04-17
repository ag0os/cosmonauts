---
id: TASK-091
title: Cost tracking in chain runner
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies:
  - TASK-090
createdAt: '2026-03-11T13:22:22.310Z'
updatedAt: '2026-03-11T13:51:02.865Z'
---

## Description

Accumulate `SpawnStats` from each spawn into `ChainStats` in `lib/orchestration/chain-runner.ts`. Emit `stage_stats` ChainEvent after each stage. Include `stats` in `StageResult` and `ChainResult`.

Changes:
- `lib/orchestration/types.ts`: Add `stats?: SpawnStats` to `StageResult`, add `stats?: ChainStats` to `ChainResult`, add `stage_stats` variant to `ChainEvent` union.
- `lib/orchestration/chain-runner.ts`: In `runStage()`, capture `SpawnResult.stats` and aggregate across loop iterations. In `runChain()`, accumulate stage stats into `ChainStats`, include in `chain_end` event.
- `tests/orchestration/chain-runner.test.ts`: Verify stats accumulation across stages and loop iterations, verify `stage_stats` events are emitted.

<!-- AC:BEGIN -->
- [ ] #1 StageResult includes aggregated stats (summed across loop iterations) as optional SpawnStats
- [ ] #2 ChainResult includes ChainStats with per-stage breakdown and totals
- [ ] #3 stage_stats ChainEvent is emitted after each stage completes with that stage's stats
- [ ] #4 chain_end event payload includes ChainStats
- [ ] #5 Chain runner tests verify stats accumulation for both one-shot and loop stages
- [ ] #6 Cost data stays ephemeral — no disk persistence
<!-- AC:END -->

## Implementation Notes

All 6 ACs implemented:\n\n1. **StageResult.stats** — `runStage()` aggregates `SpawnStats` across loop iterations using `addSpawnStats()` helper. One-shot stages pass through the single spawn's stats.\n2. **ChainResult.stats** — `runChain()` calls `buildChainStats()` to build `ChainStats` with per-stage `StageStats[]` and totals (`totalCost`, `totalTokens`, `totalDurationMs`).\n3. **stage_stats event** — Emitted after each stage completes (before `stage_end`) when the stage has stats.\n4. **chain_end includes ChainStats** — `ChainResult.stats` is populated before the `chain_end` event fires.\n5. **Tests** — 14 new test cases covering: one-shot stats passthrough, loop stats aggregation, partial stats on failure, ChainStats per-stage breakdown, chain_end payload, stage_stats event emission/ordering, no-stats edge cases, mixed one-shot+loop chain, ephemeral assertion.\n6. **Ephemeral** — Stats exist only on returned objects, no disk persistence.\n\nAlso updated `cli/chain-event-logger.ts` and `domains/shared/extensions/orchestration/index.ts` to handle the new `stage_stats` event variant (required for TypeScript exhaustiveness)."
