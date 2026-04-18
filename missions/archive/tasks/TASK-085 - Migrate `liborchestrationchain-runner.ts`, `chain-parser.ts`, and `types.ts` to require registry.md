---
id: TASK-085
title: >-
  Migrate `lib/orchestration/chain-runner.ts`, `chain-parser.ts`, and `types.ts`
  to require registry
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-081
  - TASK-084
createdAt: '2026-03-10T13:53:39.083Z'
updatedAt: '2026-03-10T17:23:25.781Z'
---

## Description

Refactor the chain runner and parser to remove `createDefaultRegistry` fallbacks:

**`lib/orchestration/chain-runner.ts`:**
1. Remove the `createDefaultRegistry` import.
2. Remove the `resolveRegistry()` helper function that falls back to `createDefaultRegistry()`.
3. Remove the private `baseRoleName` function (line ~68) — replace with `unqualifyRole` from `lib/agents/qualified-role.ts`.
4. Access `config.registry` directly (now required, not optional).

**`lib/orchestration/chain-parser.ts`:**
1. Remove the `createDefaultRegistry` import.
2. Make the `registry` parameter required in `parseChain(expression, registry, domainContext?)`.

**`lib/orchestration/types.ts`:**
1. Make `registry` required in `ChainConfig` (remove the `?` from the type).

Update tests:
- `tests/orchestration/chain-runner.test.ts` — provide registry explicitly in all test configs.
- `tests/orchestration/chain-parser.test.ts` — provide registry explicitly in all parseChain calls.

<!-- AC:BEGIN -->
- [ ] #1 `ChainConfig.registry` is required (not optional) in `lib/orchestration/types.ts`
- [ ] #2 `parseChain` requires a `registry` parameter (no default)
- [ ] #3 `resolveRegistry` helper and `createDefaultRegistry` import are removed from chain-runner.ts
- [ ] #4 `baseRoleName` in chain-runner.ts is replaced with `unqualifyRole` from qualified-role.ts
- [ ] #5 All chain-runner and chain-parser tests pass with explicitly provided registries
<!-- AC:END -->

## Implementation Notes

All 5 ACs completed:\n\n1. `ChainConfig.registry` is now required in `lib/orchestration/types.ts`\n2. `parseChain` requires a `registry` parameter (no default fallback)\n3. `resolveRegistry` helper and `createDefaultRegistry` import removed from `chain-runner.ts`\n4. `baseRoleName` replaced with `unqualifyRole` from `lib/agents/qualified-role.ts`\n5. All 68 chain-runner and chain-parser tests pass with explicitly provided registries\n\n`cli/main.ts` already passed registry explicitly to both `parseChain` and `runChain`, so no CLI changes were needed."
