---
id: COSMO-039
title: Add thinkingLevel to AgentDefinition and orchestration types
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:agent-thinking-levels'
dependencies: []
createdAt: '2026-03-05T16:02:10.685Z'
updatedAt: '2026-03-05T16:04:40.003Z'
---

## Description

Add the `thinkingLevel` type field to `AgentDefinition` in `lib/agents/types.ts`, and add `thinkingLevel` to `SpawnConfig`, `ThinkingConfig` interface, and `thinking` field on `ChainConfig` in `lib/orchestration/types.ts`. These are pure type additions with no behavioral changes.

**Files to change:**
- `lib/agents/types.ts` — add optional `thinkingLevel?: ThinkingLevel` to `AgentDefinition`
- `lib/orchestration/types.ts` — add optional `thinkingLevel?: ThinkingLevel` to `SpawnConfig`; create `ThinkingConfig` interface (mirroring `ModelConfig` shape with per-role keys + `default`); add optional `thinking?: ThinkingConfig` to `ChainConfig`

Import `ThinkingLevel` from `@mariozechner/pi-agent-core` (already used in `cli/main.ts` and `cli/session.ts`).

<!-- AC:BEGIN -->
- [ ] #1 AgentDefinition has an optional thinkingLevel field typed as ThinkingLevel from @mariozechner/pi-agent-core
- [ ] #2 SpawnConfig has an optional thinkingLevel field typed as ThinkingLevel
- [ ] #3 ThinkingConfig interface exists in lib/orchestration/types.ts with per-role optional keys (planner, taskManager, coordinator, worker, qualityManager, reviewer, fixer) and a default key, all typed as ThinkingLevel
- [ ] #4 ChainConfig has an optional thinking field typed as ThinkingConfig
- [ ] #5 Project compiles without type errors
<!-- AC:END -->

## Implementation Notes

Added `ThinkingLevel` import from `@mariozechner/pi-agent-core` to both files. Added `thinkingLevel?: ThinkingLevel` to `AgentDefinition` and `SpawnConfig`. Created `ThinkingConfig` interface with per-role keys (planner, taskManager, coordinator, worker, qualityManager, reviewer, fixer) and `default`, all typed as `ThinkingLevel`. Added `thinking?: ThinkingConfig` to `ChainConfig`. Typecheck passes clean. Pre-existing test failure in definitions.test.ts (model format regex) and lint warnings in test files are unrelated."
