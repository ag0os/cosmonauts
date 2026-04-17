---
id: TASK-121
title: >-
  Runtime integration: bootstrap CosmonautsRuntime with multi-source domain
  loading
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-116
  - TASK-117
  - TASK-119
  - TASK-120
createdAt: '2026-03-28T20:36:10.715Z'
updatedAt: '2026-03-28T20:47:07.423Z'
---

## Description

Update `CosmonautsRuntime.create()` in `lib/runtime.ts` to: (1) call `scanDomainSources()` to get `DomainSource[]`, (2) call `loadDomainsFromSources()`, (3) construct `DomainRegistry`, (4) construct `DomainResolver` (replacing the raw `domainsDir`), (5) compose skill paths across all domain sources. Update `tests/runtime.test.ts` for the new multi-source bootstrap signature.

<!-- AC:BEGIN -->
- [ ] #1 CosmonautsRuntime.create() signature accepts { builtinDomainsDir, projectRoot, pluginDirs? } instead of a single domainsDir
- [ ] #2 Bootstrap calls scanDomainSources → loadDomainsFromSources → DomainRegistry → DomainResolver in order
- [ ] #3 The runtime exposes a DomainResolver (not domainsDir) for downstream consumers
- [ ] #4 Skill paths are composed from all DomainSource directories, not just built-in
- [ ] #5 Tests verify that domains from a simulated package source are loaded and accessible at runtime
<!-- AC:END -->

## Implementation Notes

Worker completed: updated CosmonautsRuntime.create() with new signature, wired full bootstrap pipeline, composed skill paths from all sources, updated runtime tests, preserved create subcommand in cli/main.ts. Status corrected by coordinator.
