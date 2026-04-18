---
id: TASK-086
title: Migrate `cli/main.ts` and `cli/session.ts` to use `CosmonautsRuntime`
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:runtime-consolidation'
dependencies:
  - TASK-083
  - TASK-084
  - TASK-085
createdAt: '2026-03-10T13:53:52.004Z'
updatedAt: '2026-03-10T17:36:10.427Z'
---

## Description

Replace the duplicated bootstrap logic in the CLI with `CosmonautsRuntime.create()`:

**`cli/main.ts`:**
1. Replace the 20-line bootstrap block in `run()` (lines ~183-202: loadProjectConfig, loadDomains, createRegistryFromDomains, domainContext computation, selectDomainWorkflows) with a single `const runtime = await CosmonautsRuntime.create(...)`.
2. Remove the local `resolveModel` function (lines ~69-87) — import it from `lib/orchestration/agent-spawner.ts`.
3. Use `runtime.agentRegistry` where `registry` was used, `runtime.workflows` where `domainWorkflows` was used, `runtime.domainContext` where `domainContext` was used, `runtime.projectConfig.skills` where `projectSkills` was used.
4. Pass `runtime.domainsDir` to `createSession` (see session.ts changes).

**`cli/session.ts`:**
1. Add `domainsDir` to `CreateSessionOptions`.
2. Remove the module-level `DOMAINS_DIR` constant (computed from `import.meta.url`).
3. Use the `domainsDir` option for prompt assembly and extension resolution.

Update `tests/cli/main.test.ts` if the bootstrap path changes affect test mocking.

<!-- AC:BEGIN -->
- [ ] #1 `cli/main.ts` run() function uses `CosmonautsRuntime.create()` instead of manual bootstrap
- [ ] #2 No local `resolveModel` copy exists in `cli/main.ts` — it is imported from agent-spawner.ts
- [ ] #3 `cli/session.ts` accepts `domainsDir` via `CreateSessionOptions` instead of computing its own `DOMAINS_DIR`
- [ ] #4 No module-level `DOMAINS_DIR` constant remains in `cli/session.ts`
- [ ] #5 All CLI modes (interactive, print, chain, workflow, init, list-*) continue to work correctly
- [ ] #6 CLI tests pass with the updated bootstrap path
<!-- AC:END -->

## Implementation Notes

All changes committed in 3773ed1.\n\n- `cli/main.ts`: Replaced 20-line bootstrap block with `CosmonautsRuntime.create()`. Removed local `resolveModel`, now imported from `lib/orchestration/agent-spawner.ts`. All modes (interactive, print, chain, workflow, init, list-*) use runtime properties.\n- `cli/session.ts`: Added `domainsDir` to `CreateSessionOptions`, removed module-level `DOMAINS_DIR` constant. Both prompt assembly and extension resolution use the passed-in `domainsDir`.\n- `lib/workflows/loader.ts`: Widened `loadWorkflows`, `resolveWorkflow`, and `listWorkflows` signatures to accept `readonly WorkflowDefinition[]` for compatibility with the frozen runtime.\n- Also passed `domainsDir` to `runChain` calls so chain-runner uses the runtime's directory instead of its fallback.\n- Tests: No test changes needed — `tests/cli/main.test.ts` only tests `parseCliArgs` which was unaffected. All 780 tests pass."
