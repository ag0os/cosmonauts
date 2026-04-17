---
title: Orchestration Module Decomposition
status: completed
createdAt: '2026-03-21T03:29:07.392Z'
updatedAt: '2026-03-21T03:52:39.434Z'
---

## Summary

Pure structural refactor of `lib/orchestration/agent-spawner.ts` and `domains/shared/extensions/orchestration/index.ts` into focused, single-responsibility modules. No behavior changes. Prepares clean seams for the `parallel-agent-spawning` plan.

## Scope

### Included
- Split `agent-spawner.ts` (470 lines) into 4 focused modules
- Split orchestration extension `index.ts` (630 lines) into 5 focused modules
- Move all existing tests to match new file structure
- Verify all exports are re-exported from original entry points (no breaking changes for external consumers)

### Excluded
- No behavior changes, no new features, no API changes
- No changes to `chain-runner.ts`, `chain-parser.ts`, or `types.ts`
- No changes to agent definitions or prompts

### Assumptions
- All existing tests pass before and after the refactor
- No external consumers import from deep paths (all imports go through `lib/orchestration/` or extension entry points)

## Approach

### agent-spawner.ts decomposition

The current file has four distinct concerns mixed together:

1. **Model/thinking resolution** (`getModelForRole`, `getThinkingForRole`, `resolveModel`) — pure functions that map role names to model IDs and thinking levels. Used by both the spawner and the chain runner.

2. **Definition resolution** (`resolveTools`, `resolveExtensionPaths`, `isDirectory`) — resolves agent definition fields (tool sets, extension paths) to concrete values. General-purpose helpers not specific to spawning.

3. **Session creation** — the 60-line block inside `spawn()` that resolves the definition, assembles prompts, builds the resource loader, creates session options, and calls `createAgentSession()`. This is the piece that parallel spawning needs to reuse for multi-turn sessions.

4. **Spawn execution** — the `AgentSpawner` interface, `createPiSpawner()`, event mapping, stats extraction. The actual spawn lifecycle.

Split into:
- `model-resolution.ts` — concern 1
- `definition-resolution.ts` — concern 2
- `session-factory.ts` — concern 3 (new: extracted session creation as a reusable function)
- `agent-spawner.ts` — concern 4 (slimmed, imports from the others)

### Extension decomposition

The current extension file has five distinct concerns:

1. **Rendering helpers** — `roleLabel()`, `formatDuration()`, `chainEventToProgressLine()`, `buildProgressText()`, `buildCostTable()`, `renderTextFallback()`. Pure functions used by both tools.

2. **Authorization** — `isSubagentAllowed()`. Used only by spawn_agent but conceptually separate.

3. **chain_run tool** — tool registration, execute handler, renderCall, renderResult. Self-contained.

4. **spawn_agent tool** — tool registration, execute handler, renderCall, renderResult. Self-contained.

5. **Extension entry point** — runtime cache, `getRuntime()`, tool registrations.

Split into:
- `rendering.ts` — concern 1
- `authorization.ts` — concern 2
- `chain-tool.ts` — concern 3 (exports a function that registers the tool)
- `spawn-tool.ts` — concern 4 (exports a function that registers the tool)
- `index.ts` — concern 5 (slimmed, calls registration functions from tool modules)

## Files to Change

### New files (extracted from existing)
- `lib/orchestration/model-resolution.ts` — `getModelForRole()`, `getThinkingForRole()`, `resolveModel()`, `FALLBACK_MODEL`. (~80 lines)
- `lib/orchestration/definition-resolution.ts` — `resolveTools()`, `resolveExtensionPaths()`, `ResolveExtensionOptions`, `isDirectory()`. (~60 lines)
- `lib/orchestration/session-factory.ts` — `createAgentSessionFromDefinition()` function that takes an agent definition + spawn config and returns a configured `AgentSession`. Extracts the 60-line session setup block from `spawn()`. (~90 lines)
- `domains/shared/extensions/orchestration/rendering.ts` — `roleLabel()`, `ROLE_LABELS`, `formatDuration()`, `chainEventToProgressLine()`, `buildProgressText()`, `buildCostTable()`, `renderTextFallback()`. (~130 lines)
- `domains/shared/extensions/orchestration/authorization.ts` — `isSubagentAllowed()`. (~15 lines)
- `domains/shared/extensions/orchestration/chain-tool.ts` — `registerChainTool(pi, getRuntime)` function. Contains chain_run tool definition with execute, renderCall, renderResult. (~120 lines)
- `domains/shared/extensions/orchestration/spawn-tool.ts` — `registerSpawnTool(pi, getRuntime)` function. Contains spawn_agent tool definition with execute, renderCall, renderResult. (~150 lines)

### Modified files
- `lib/orchestration/agent-spawner.ts` — Remove extracted functions. Import from `model-resolution.ts`, `definition-resolution.ts`, `session-factory.ts`. The `createPiSpawner` function becomes ~80 lines (session creation delegated to factory, model/thinking resolution imported). Keep event mapping helpers and `SpawnEventPayload` type here since they're spawner-specific.
- `domains/shared/extensions/orchestration/index.ts` — Remove all tool logic, rendering, and authorization. Import and call `registerChainTool()` and `registerSpawnTool()`. Keep `getRuntime()` and runtime cache. Becomes ~30 lines.
- `lib/orchestration/chain-runner.ts` — Update imports: `getModelForRole`, `getThinkingForRole` now come from `model-resolution.ts` instead of `agent-spawner.ts`.

### Test files
- `tests/orchestration/agent-spawner.test.ts` — Update imports if needed. Tests should pass unchanged since behavior is identical.
- `tests/orchestration/agent-spawner.spawn.test.ts` — Update imports if needed.
- No new test files needed — this is a pure extraction refactor. Existing tests cover all behavior.

## Risks

1. **Import path breakage**: If any code imports specific functions from `agent-spawner.ts` by deep path, those imports break. Mitigation: `agent-spawner.ts` re-exports everything from the extracted modules, preserving the public API.

2. **Circular dependencies**: `session-factory.ts` imports from `model-resolution.ts` and `definition-resolution.ts`. `agent-spawner.ts` imports from `session-factory.ts`. Chain is linear, no cycles.

3. **Extension tool registration order**: The split tools must be registered in the same order. The `index.ts` calls `registerChainTool()` then `registerSpawnTool()` to preserve order.

## Implementation Order

1. **Extract `model-resolution.ts`** — Move `getModelForRole`, `getThinkingForRole`, `resolveModel`, `FALLBACK_MODEL`. Add re-exports in `agent-spawner.ts`. Update `chain-runner.ts` imports.

2. **Extract `definition-resolution.ts`** — Move `resolveTools`, `resolveExtensionPaths`, `ResolveExtensionOptions`, `isDirectory`. Add re-exports in `agent-spawner.ts`.

3. **Extract `session-factory.ts`** — Extract the session creation block from `spawn()` into `createAgentSessionFromDefinition()`. The spawner calls this function instead of inline setup. Add re-export in `agent-spawner.ts`.

4. **Extract extension `rendering.ts`** — Move all rendering helpers. Import from tool modules.

5. **Extract extension `authorization.ts`** — Move `isSubagentAllowed()`. Import from `spawn-tool.ts`.

6. **Extract extension `chain-tool.ts`** — Move chain_run tool registration into `registerChainTool()`. Import in `index.ts`.

7. **Extract extension `spawn-tool.ts`** — Move spawn_agent tool registration into `registerSpawnTool()`. Import in `index.ts`.

8. **Slim extension `index.ts`** — Remove all extracted code. Call registration functions. Verify.
