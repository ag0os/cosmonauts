---
id: COSMO-043
title: Add thinkingLevel parameter to spawn_agent and chain_run tool schemas
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-041
  - COSMO-042
createdAt: '2026-03-05T16:02:49.950Z'
updatedAt: '2026-03-05T16:14:27.283Z'
---

## Description

Update the orchestration extension (`extensions/orchestration/index.ts`) to expose thinking level in both tool schemas so agents can control thinking when spawning sub-agents or running chains.

**Files to change:**
- `extensions/orchestration/index.ts`:
  - `spawn_agent` tool: add optional `thinkingLevel` string parameter to the schema; pass it through to `spawner.spawn()` in the `SpawnConfig`
  - `chain_run` tool: optionally accept thinking config; if the plan calls for it, add a `thinking` parameter (or at minimum, a `thinkingLevel` string for a chain-wide default); pass it into `runChain()` config as `thinking`

<!-- AC:BEGIN -->
- [x] #1 spawn_agent tool schema includes an optional thinkingLevel parameter
- [x] #2 spawn_agent passes the thinkingLevel parameter through to spawner.spawn() in SpawnConfig
- [x] #3 chain_run tool supports specifying thinking configuration that gets passed to runChain()
- [x] #4 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Added optional `thinkingLevel` string parameter to both `spawn_agent` and `chain_run` tool schemas in `extensions/orchestration/index.ts`.\n\n- `spawn_agent`: parameter is cast to `ThinkingLevel` and passed directly to `spawner.spawn()` in SpawnConfig.\n- `chain_run`: parameter is wrapped as `{ default: thinkingLevel }` ThinkingConfig and passed to `runChain()` as `thinking`, which flows through `getThinkingForRole()` resolution.\n\nTypecheck passes cleanly. Pre-existing lint warnings (JSON formatting) and one unrelated test failure (model ID regex) are not caused by these changes.
