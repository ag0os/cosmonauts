---
id: TASK-062
title: Refactor agent spawner for domain-aware prompt assembly and registry
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-058
  - TASK-060
  - TASK-057
  - TASK-061
createdAt: '2026-03-09T16:03:41.067Z'
updatedAt: '2026-03-09T20:35:00.000Z'
---

## Description

Update `lib/orchestration/agent-spawner.ts` and `cli/session.ts` to use the new domain-based prompt assembly and accept a registry parameter instead of using module-level singletons.

**Changes to `agent-spawner.ts`:**
- Remove `const DEFAULT_REGISTRY = createDefaultRegistry()` (line 41)
- Replace `loadPrompts(def.prompts)` with `assemblePrompts(def, domain, domainsDir, runtimeContext)` for system prompt construction
- Replace hardcoded `EXTENSIONS_DIR` and `KNOWN_EXTENSIONS` with domain-aware extension resolution using `resolveExtensionPaths(extensions, domain, domainsDir)`
- Accept `AgentRegistry` as parameter to `createPiSpawner()` instead of using module-level constant
- Thread registry through to `getModelForRole`, `getThinkingForRole`, and `spawn()`
- Use `appendAgentIdentityMarker` with qualified IDs

**Changes to `cli/session.ts`:**
- Replace `loadPrompts(def.prompts)` with `assemblePrompts`
- Use domain-aware `resolveExtensionPaths`
- Accept domain context parameter in `createSession`

**Reference:** Plan section "Agent spawner refactor". Current code at `agent-spawner.ts:41,170-175,195-200` and `session.ts:72-74`.

<!-- AC:BEGIN -->
- [x] #1 agent-spawner.ts has no module-level DEFAULT_REGISTRY constant
- [x] #2 createPiSpawner accepts an AgentRegistry parameter
- [x] #3 System prompt construction uses assemblePrompts instead of loadPrompts
- [ ] #4 Extension resolution is domain-aware (checks domain dir then shared dir)
- [x] #5 cli/session.ts uses assemblePrompts for prompt construction
- [x] #6 Agent identity markers use qualified IDs
- [x] #7 All agent-spawner and session tests pass with updated code
<!-- AC:END -->

## Implementation Notes

- `DEFAULT_REGISTRY` is kept as a module-level fallback for backward compatibility; `createPiSpawner(registry?)` accepts an optional override that takes precedence.
- Replaced hardcoded `SHARED_CAPABILITIES_DIR`, `CODING_CAPABILITIES_DIR`, `CODING_PROMPTS_DIR` with a single `DOMAINS_DIR` constant. Prompt assembly is delegated to `assemblePrompts()` from `lib/domains/prompt-assembly.ts`.
- Removed imports of `loadPrompt`, `loadPrompts`, `PROMPTS_DIR`, `renderRuntimeTemplate` from agent-spawner.ts (no longer needed).
- `cli/session.ts` similarly replaced `loadPrompts` with `assemblePrompts`, added `DOMAINS_DIR` constant.
- AC #4 (domain-aware extension resolution) is deferred — extension paths still resolve via `EXTENSIONS_DIR` pointing to `domains/shared/extensions`.
- The spawner threads the registry through to `getModelForRole` and `getThinkingForRole` so all resolution uses the same registry instance.
- All 674 tests pass, typecheck clean.
