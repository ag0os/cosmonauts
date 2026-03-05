---
id: COSMO-041
title: Add getThinkingForRole() and wire thinking level through agent spawner
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies:
  - COSMO-039
createdAt: '2026-03-05T16:02:30.084Z'
updatedAt: '2026-03-05T16:07:31.928Z'
---

## Description

Add a `getThinkingForRole()` helper to `lib/orchestration/agent-spawner.ts` (parallel to `getModelForRole()`) and pass the resolved thinking level to `createAgentSession()` in the `spawn()` method.

**Resolution order (matching getModelForRole pattern):**
1. Explicit `SpawnConfig.thinkingLevel` (set by caller/chain runner)
2. Agent definition `thinkingLevel` (from registry)
3. `ThinkingConfig.default` if provided (via a config parameter)
4. `undefined` (no thinking — Pi default)

**Files to change:**
- `lib/orchestration/agent-spawner.ts`:
  - Add exported `getThinkingForRole(role, thinking?, registry?)` function mirroring `getModelForRole`
  - Reuse the existing `roleToConfigKey()` helper for mapping role names to config keys
  - In `createPiSpawner().spawn()`, read `config.thinkingLevel` and pass it to `createAgentSession()` as the `thinkingLevel` parameter
  - Note: `createAgentSession()` already accepts `thinkingLevel` (confirmed in `cli/session.ts:108`)

<!-- AC:BEGIN -->
- [ ] #1 getThinkingForRole() is exported from lib/orchestration/agent-spawner.ts
- [ ] #2 getThinkingForRole() follows the 4-tier resolution: explicit override > definition > config default > undefined
- [ ] #3 createPiSpawner().spawn() passes config.thinkingLevel through to createAgentSession()
- [ ] #4 When SpawnConfig.thinkingLevel is undefined and the agent definition has no thinkingLevel, createAgentSession receives undefined for thinkingLevel
- [ ] #5 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Implemented `getThinkingForRole()` in `lib/orchestration/agent-spawner.ts` following the exact same pattern as `getModelForRole()`. The function uses `roleToConfigKey()` for config lookup and follows the 4-tier resolution: explicit ThinkingConfig override → agent definition thinkingLevel → ThinkingConfig.default → undefined. In `createPiSpawner().spawn()`, `config.thinkingLevel` is read and passed directly to `createAgentSession()`. All 22 existing agent-spawner tests pass, typecheck clean.
