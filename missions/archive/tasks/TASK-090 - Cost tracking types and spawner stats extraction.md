---
id: TASK-090
title: Cost tracking types and spawner stats extraction
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies: []
createdAt: '2026-03-11T13:22:12.999Z'
updatedAt: '2026-03-11T13:43:21.640Z'
---

## Description

Define `SpawnStats` and `ChainStats` interfaces in `lib/orchestration/types.ts`. Modify `lib/orchestration/agent-spawner.ts` to call `session.getSessionStats()` before `session.dispose()` and populate a new `stats` field on `SpawnResult`.

Key API: `getSessionStats()` at `agent-session.d.ts:559` returns `SessionStats` with `tokens: { input, output, cacheRead, cacheWrite, total }`, `cost`, `userMessages`, `assistantMessages`, `toolCalls`, `totalMessages`.

Changes:
- `lib/orchestration/types.ts`: Add `SpawnStats` (mirrors SessionStats fields + durationMs), add `stats?: SpawnStats` to `SpawnResult`, define `ChainStats` with `stages: StageStats[]` and totals.
- `lib/orchestration/agent-spawner.ts`: Extract stats from session after `session.prompt()` completes, before `dispose()`. Populate `SpawnResult.stats`.
- `tests/orchestration/agent-spawner.test.ts`: Verify stats extraction in spawn results.

<!-- AC:BEGIN -->
- [ ] #1 SpawnStats interface defined in lib/orchestration/types.ts with tokens (input, output, cacheRead, cacheWrite, total), cost, durationMs, turns, and toolCalls fields
- [ ] #2 ChainStats interface defined with stages array and totalCost, totalTokens, totalDurationMs aggregates
- [ ] #3 SpawnResult type includes optional stats field of type SpawnStats
- [ ] #4 agent-spawner.ts calls session.getSessionStats() before dispose() and maps result to SpawnStats
- [ ] #5 Existing agent-spawner tests pass and new test cases verify stats are populated in SpawnResult
<!-- AC:END -->

## Implementation Notes

All 5 ACs implemented:\n\n1. **SpawnStats** interface in `lib/orchestration/types.ts` with `tokens` (TokenStats sub-interface), `cost`, `durationMs`, `turns`, `toolCalls`.\n2. **ChainStats** interface with `stages: StageStats[]`, `totalCost`, `totalTokens`, `totalDurationMs`. Also added **StageStats** (per-stage breakdown) and **TokenStats** (reusable token shape).\n3. **SpawnResult** now has `stats?: SpawnStats`.\n4. **agent-spawner.ts** calls `session.getSessionStats()` after `session.prompt()` completes, before the `finally` block calls `dispose()`. Maps `SessionStats` fields to `SpawnStats` (uses `userMessages` for `turns`).\n5. All 113 orchestration tests pass, including 3 new test cases: stats populated on success, getSessionStats called before dispose, stats absent on failure.\n\nNote: `turns` maps to `SessionStats.userMessages` since each user message represents one turn in the conversation."
