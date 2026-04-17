## Dependency

This plan depends on `orchestration-refactor` being completed first. The file paths and modification targets below assume the post-refactor module structure.

## Post-Refactor File Mapping

The refactor changes which files the parallel spawning plan touches:

### Spawner multi-turn loop
- **Before refactor**: modify `lib/orchestration/agent-spawner.ts` (470-line monolith)
- **After refactor**: modify `lib/orchestration/agent-spawner.ts` (~80 lines, spawn lifecycle only). Session creation uses `session-factory.ts` — the multi-turn loop calls `createAgentSessionFromDefinition()` once, then `session.prompt()` in a loop. Clean separation.

### Non-blocking spawn_agent tool
- **Before refactor**: modify `domains/shared/extensions/orchestration/index.ts` (630-line monolith)
- **After refactor**: modify `domains/shared/extensions/orchestration/spawn-tool.ts` (~150 lines, spawn tool only). No risk of conflicting with chain_run changes. Authorization stays in `authorization.ts`.

### Session creation reuse
- **Before refactor**: session creation is inline in `spawn()`, would need to be duplicated or extracted during parallel spawning work
- **After refactor**: `session-factory.ts` already exports `createAgentSessionFromDefinition()`. The non-blocking spawn tool calls it directly to create child sessions, independent of the spawner.

### Model resolution
- **Before refactor**: `getModelForRole()` and `resolveModel()` live in `agent-spawner.ts`, tightly coupled
- **After refactor**: live in `model-resolution.ts`, importable by spawn-tool.ts for child session model resolution without depending on the spawner.

## Impact on Implementation Order

Steps 6 and 7 of the parallel spawning plan become significantly simpler:

- **Step 6 (spawner multi-turn loop)**: Modifies a focused ~80-line file instead of a 470-line file. Worker can focus purely on the loop logic without navigating model resolution and session setup code.

- **Step 7 (extension spawn_agent rewrite)**: Modifies a focused ~150-line file instead of a 630-line file. No collision with chain_run code. Can import `createAgentSessionFromDefinition()` from `session-factory.ts` to create child sessions.

## No Other Changes Needed

The parallel spawning plan's new files (message-bus, spawn-tracker, spawn-limits, semaphore) are unaffected by the refactor — they're new modules in `lib/orchestration/`. The types update, prompt updates, and test files are also unchanged.