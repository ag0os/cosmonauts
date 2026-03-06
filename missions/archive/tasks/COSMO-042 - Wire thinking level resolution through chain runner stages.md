---
id: COSMO-042
title: Wire thinking level resolution through chain runner stages
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-041
createdAt: '2026-03-05T16:02:40.883Z'
updatedAt: '2026-03-05T16:09:30.398Z'
---

## Description

Update `lib/orchestration/chain-runner.ts` to resolve thinking level per stage using `getThinkingForRole()` and pass it to `spawner.spawn()` via `SpawnConfig.thinkingLevel`.

**Files to change:**
- `lib/orchestration/chain-runner.ts`:
  - Import `getThinkingForRole` from `./agent-spawner.ts`
  - In `runStage()`, resolve thinking level: `const thinkingLevel = getThinkingForRole(stage.name, config.thinking)`
  - Pass `thinkingLevel` in the `spawner.spawn()` calls (both one-shot and loop paths)
  - This mirrors the existing `getModelForRole(stage.name, config.models)` pattern already in `runStage()`

<!-- AC:BEGIN -->
- [ ] #1 runStage() calls getThinkingForRole() with the stage name and config.thinking
- [ ] #2 SpawnConfig passed to spawner.spawn() includes the resolved thinkingLevel in both one-shot and loop stage paths
- [ ] #3 When config.thinking is undefined, agents still get their definition-level thinkingLevel (resolved by getThinkingForRole)
- [ ] #4 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Changes made:

1. **lib/orchestration/chain-runner.ts**: Added `getThinkingForRole` import and resolved `thinkingLevel` in `runStage()` alongside existing `getModelForRole` call. Passed `thinkingLevel` to `spawner.spawn()` in both one-shot and loop stage paths.

2. **tests/orchestration/chain-runner.test.ts**: Added `getThinkingForRole: () => undefined` to the `vi.mock()` for agent-spawner module, since the mock was missing this newly imported export.
