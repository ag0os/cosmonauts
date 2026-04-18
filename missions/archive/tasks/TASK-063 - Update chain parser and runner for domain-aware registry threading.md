---
id: TASK-063
title: Update chain parser and runner for domain-aware registry threading
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-060
createdAt: '2026-03-09T16:03:57.107Z'
updatedAt: '2026-03-09T19:38:00.000Z'
---

## Description

Update the chain parser and runner to accept an `AgentRegistry` parameter instead of using module-level singletons, and handle qualified agent names in chain expressions.

**Changes to `chain-parser.ts`:**
- Remove `const DEFAULT_REGISTRY = createDefaultRegistry()` (line 16)
- `parseChain` accepts an optional `AgentRegistry` parameter
- Qualified names like `"coding/planner -> coding/worker"` split on `->` correctly (keep `/` intact)
- `loop` property lookup uses the provided registry

**Changes to `chain-runner.ts`:**
- Remove `const DEFAULT_REGISTRY = createDefaultRegistry()` (line 29)
- `runChain` and `runStage` accept or receive `AgentRegistry` through `ChainConfig`
- Thread registry to `getModelForRole`, `getThinkingForRole`, and spawner
- `DEFAULT_STAGE_PROMPTS` keys updated to handle qualified names or remain as unqualified fallbacks

**Changes to `types.ts` (if needed):**
- `ChainConfig` gains optional `registry?: AgentRegistry` field
- `AgentRole` type may need widening if it was a string union

**Reference:** Plan section "Chain parser and runner updates". Current singletons at `chain-parser.ts:16` and `chain-runner.ts:29`.

<!-- AC:BEGIN -->
- [x] #1 chain-parser.ts has no module-level DEFAULT_REGISTRY constant
- [x] #2 chain-runner.ts has no module-level DEFAULT_REGISTRY constant
- [x] #3 parseChain accepts an AgentRegistry parameter for loop property resolution
- [x] #4 Qualified agent names in chain expressions (e.g. 'coding/planner -> coding/worker') parse correctly
- [x] #5 ChainConfig supports passing a registry instance
- [x] #6 runChain and runStage use the provided registry for all agent lookups
- [x] #7 Chain parser and runner tests pass with qualified and unqualified names
<!-- AC:END -->

## Implementation Notes

- `chain-parser.ts`: Removed module-level `DEFAULT_REGISTRY`. `parseChain()` now accepts an optional `registry` parameter; creates a default registry on demand if none provided.
- `chain-runner.ts`: Removed module-level `DEFAULT_REGISTRY`. Added `resolveRegistry()` helper that reads `config.registry` and falls back to `createDefaultRegistry()`. `runStage()` passes the resolved registry to `getModelForRole()` and `getThinkingForRole()`.
- `types.ts`: Added `registry?: AgentRegistry` field to `ChainConfig` interface.
- Tests: Added 7 new tests covering qualified names (`coding/planner -> coding/worker`), custom registry threading in both parser and runner, and fallback behavior for unknown agents.
