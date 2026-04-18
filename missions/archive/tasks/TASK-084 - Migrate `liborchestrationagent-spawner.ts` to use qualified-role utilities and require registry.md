---
id: TASK-084
title: >-
  Migrate `lib/orchestration/agent-spawner.ts` to use qualified-role utilities
  and require registry
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-081
createdAt: '2026-03-10T13:53:27.021Z'
updatedAt: '2026-03-10T17:17:44.465Z'
---

## Description

Refactor `lib/orchestration/agent-spawner.ts` to eliminate duplicated code and static defaults:

1. **Remove** the `DEFAULT_REGISTRY` constant and its `createDefaultRegistry()` import.
2. **Remove** the module-level `DOMAINS_DIR` constant — callers will provide `domainsDir` via the runtime.
3. **Remove** the private `baseRoleName` function (line ~368) — replace with `unqualifyRole` imported from `lib/agents/qualified-role.ts`.
4. **Remove** the private `roleToConfigKey` function (lines 348-366) — replace with `roleToConfigKey` imported from `lib/agents/qualified-role.ts`.
5. **Make `registry` required** in `createPiSpawner(registry: AgentRegistry)` — remove the optional parameter and `DEFAULT_REGISTRY` fallback.
6. **Add `domainsDir` parameter** to `createPiSpawner` or to `SpawnConfig` so the spawner no longer computes its own domains path.
7. **Export `resolveModel`** so `cli/main.ts` can import it instead of duplicating it.

Update tests at `tests/orchestration/agent-spawner.test.ts` and `tests/orchestration/agent-spawner.spawn.test.ts` to always provide an explicit registry.

<!-- AC:BEGIN -->
- [ ] #1 `createPiSpawner` requires a registry parameter (no default fallback)
- [ ] #2 No `DEFAULT_REGISTRY` or `DOMAINS_DIR` module-level constants remain in agent-spawner.ts
- [ ] #3 `baseRoleName` and `roleToConfigKey` are replaced with imports from `lib/agents/qualified-role.ts`
- [ ] #4 `resolveModel` is exported from agent-spawner.ts for reuse by CLI
- [ ] #5 The spawner receives `domainsDir` instead of computing it from `import.meta.url`
- [ ] #6 All agent-spawner tests pass with explicitly provided registries
<!-- AC:END -->

## Implementation Notes

All changes implemented in commit 4bebd5b on `runtime-consolidation` branch.

**Key decisions:**
- `createPiSpawner(registry: AgentRegistry, domainsDir: string)` — both params required, no defaults.
- `getModelForRole` / `getThinkingForRole` keep `registry` optional (`registry?.get(...)` instead of `(registry ?? DEFAULT_REGISTRY).get(...)`), since some callers don't need registry when the model override is sufficient.
- `domainsDir` added as optional field to `ChainConfig` in types.ts. `chain-runner.ts` computes a fallback from its own `import.meta.url` to maintain backward compat for callers that don't provide it.
- The orchestration extension passes its existing `DOMAINS_DIR` constant to `createPiSpawner`.
- `resolveModel` is now exported from agent-spawner.ts for CLI reuse (cli/main.ts still has its own copy — a follow-up task could replace it with the import).

**Callers updated:**
- `lib/orchestration/chain-runner.ts` — threads `domainsDir` from `ChainConfig`
- `domains/shared/extensions/orchestration/index.ts` — passes `DOMAINS_DIR`
- `tests/orchestration/agent-spawner.spawn.test.ts` — provides explicit registry + domainsDir
- `tests/extensions/orchestration.test.ts` — updated assertion for second `domainsDir` argument"
