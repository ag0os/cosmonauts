---
id: TASK-087
title: Migrate orchestration extension to use cached `CosmonautsRuntime`
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-083
  - TASK-084
createdAt: '2026-03-10T13:54:03.157Z'
updatedAt: '2026-03-10T17:31:01.794Z'
---

## Description

Refactor `domains/shared/extensions/orchestration/index.ts` to replace `loadRuntimeDomainContext()` with a cached `CosmonautsRuntime.create()` call:

1. Remove the `DOMAINS_DIR` module-level constant.
2. Remove the `loadRuntimeDomainContext()` function and its `RuntimeDomainContext` interface.
3. Replace with a per-cwd cached `CosmonautsRuntime.create()` call. Cache the runtime promise in a `Map<string, Promise<CosmonautsRuntime>>` so subsequent tool calls for the same cwd reuse the same runtime.
4. Replace the inline `roleLabel` slash-splitting (line ~41-42: `role.includes("/") ? role.split("/").pop()`) with `unqualifyRole` from `lib/agents/qualified-role.ts`.
5. Update both `chain_run` and `spawn_agent` tool execute functions to use the cached runtime's `agentRegistry`, `domainContext`, and `projectSkills`.
6. Pass `runtime.domainsDir` where needed for spawner creation.

Update `tests/extensions/orchestration.test.ts` for the new runtime-based path.

<!-- AC:BEGIN -->
- [ ] #1 `loadRuntimeDomainContext` function and `DOMAINS_DIR` constant are removed from the orchestration extension
- [ ] #2 Runtime is cached per-cwd to avoid reloading domains on every tool call
- [ ] #3 Inline slash-splitting for role labels uses `unqualifyRole` from qualified-role.ts
- [ ] #4 Both `chain_run` and `spawn_agent` tools use the cached runtime for registry, domainContext, and projectSkills
- [ ] #5 Extension tests pass with the updated runtime-based approach
<!-- AC:END -->

## Implementation Notes

Migrated orchestration extension to use cached CosmonautsRuntime:\n\n1. Removed `DOMAINS_DIR` module-level constant, `RuntimeDomainContext` interface, and `loadRuntimeDomainContext()` function.\n2. Added `runtimeCache` (Map<string, Promise<CosmonautsRuntime>>) and `getRuntime()` helper inside the extension function closure — each extension instance gets its own cache, so tests naturally get fresh caches.\n3. Replaced inline slash-splitting in `roleLabel()` with `unqualifyRole()` from qualified-role.ts.\n4. Both `chain_run` and `spawn_agent` now use the cached runtime's `agentRegistry`, `domainContext`, `projectSkills`, and `domainsDir`.\n5. Tests updated to mock `CosmonautsRuntime.create` instead of `loadProjectConfig`. Real domains are loaded once in `beforeAll` to build a real registry for permission tests. Added a new test verifying runtime caching behavior.\n\nAll 780 tests pass. Typecheck clean."
