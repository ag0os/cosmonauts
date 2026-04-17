---
id: TASK-088
title: >-
  Clean up `lib/agents/resolver.ts` and `lib/agents/index.ts` — remove
  `createDefaultRegistry` and `resolveAgent`
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-086
  - TASK-087
createdAt: '2026-03-10T13:54:16.631Z'
updatedAt: '2026-03-10T17:40:07.877Z'
---

## Description

Final cleanup of the static agent import bridge in the resolver module:

**`lib/agents/resolver.ts`:**
1. Remove the 8 static agent imports from `domains/coding/agents/*.ts` at the top of the file.
2. Remove the `CODING_DOMAIN_DEFINITIONS` array.
3. Change the `AgentRegistry` constructor to require a `builtins` parameter (no default value).
4. Delete `createDefaultRegistry()` function.
5. Delete `resolveAgent()` function.
6. Update `resolveId()` internal method to use `splitRole` from `qualified-role.ts` for the slash-index logic (line ~117-118).

**`lib/agents/runtime-identity.ts`:**
1. Change `qualifyAgentId` to re-export `qualifyRole` from `qualified-role.ts` for backward compatibility.

**`lib/agents/index.ts`:**
1. Remove `createDefaultRegistry` and `resolveAgent` from re-exports.
2. Add re-exports from `qualified-role.ts`: `qualifyRole`, `unqualifyRole`, `splitRole`, `roleToConfigKey`.

Grep the entire codebase for any remaining references to `createDefaultRegistry` or `resolveAgent` to ensure no call sites are missed.

Update `tests/agents/resolver.test.ts` to provide explicit definitions instead of relying on default registry.

<!-- AC:BEGIN -->
- [ ] #1 `createDefaultRegistry` and `resolveAgent` are removed from `lib/agents/resolver.ts`
- [ ] #2 The 8 static agent imports from `domains/coding/agents/` are removed from resolver.ts
- [ ] #3 `AgentRegistry` constructor requires a `builtins` parameter (no implicit default)
- [ ] #4 `qualifyAgentId` in runtime-identity.ts re-exports `qualifyRole` from qualified-role.ts
- [ ] #5 `lib/agents/index.ts` exports `qualifyRole`, `unqualifyRole`, `splitRole`, `roleToConfigKey` and no longer exports `createDefaultRegistry` or `resolveAgent`
- [ ] #6 No remaining references to `createDefaultRegistry` or `resolveAgent` exist in the codebase
- [ ] #7 All resolver tests pass with explicitly provided definitions
<!-- AC:END -->

## Implementation Notes

All 7 ACs completed:\n\n1. `createDefaultRegistry` and `resolveAgent` removed from resolver.ts\n2. All 8 static agent imports from `domains/coding/agents/` removed\n3. `AgentRegistry` constructor now requires `builtins: readonly AgentDefinition[]` (no default)\n4. `qualifyAgentId` re-exports `qualifyRole` via `export { qualifyRole as qualifyAgentId }`\n5. `index.ts` exports `qualifyRole`, `unqualifyRole`, `splitRole`, `roleToConfigKey` and no longer exports removed functions\n6. Grep confirmed zero remaining references to `createDefaultRegistry` or `resolveAgent`\n7. All 776 tests pass, including updated resolver, chain-parser, and chain-runner tests using explicit definitions\n\nAlso updated `resolveId()` to use `splitRole()` from `qualified-role.ts` instead of inline slash-index logic."
