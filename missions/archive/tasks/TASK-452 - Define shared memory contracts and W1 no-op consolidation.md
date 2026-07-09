---
id: TASK-452
title: Define shared memory contracts and W1 no-op consolidation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-451
createdAt: '2026-07-08T13:53:08.585Z'
updatedAt: '2026-07-08T15:40:02.335Z'
---

## Description

Implementation Order step 2. Depends on the Pi-First audit gate. This task starts the shared interface foundation but does not own or complete B-002; B-002 completes only when the architecture retrofit wires the second real store in step 4. Behavior ownership: B-011 only. Keep the core domain-neutral and avoid speculative future machinery.

<!-- AC:BEGIN -->
- [x] #1 Shared memory contracts expose the W1 scope/kind taxonomy (session/project/user x semantic/procedural/episodic), MemoryStore write/retrieve/consolidate shape, skippedScopes, MemoryQuery/MemoryRetrieveResult, and a MemoryWriteResult union whose failed arm is reachable and honest rather than placeholder-only.
- [x] #2 MemoryConsolidateResult is the noop-only W1 shape with no unreachable consolidated variant, registry/plugin framework, unused backend, config surface, session-store scaffold, embedding/SQLite hook, pruning, decay, or dreaming scaffold.
- [x] #3 Factory seams for the markdown store and architecture-map adapter exist at the contract level with factory-bound roots/deps, architecture writes honestly unsupported, and generated architecture-map writes still owned by generateArchitectureMap.
- [x] #4 B-011 tests prove consolidate() on both W1 store implementations returns an explicit no-op explanation and does not modify record files or indexes, with @cosmo-behavior plan:memory-interface#B-011 in tests/memory/interface.test.ts.
- [x] #5 Boundary conformance holds for the new memory core: lib/memory/* imports no Pi, CLI, domains, tasks, plans, orchestration, architecture-map, or artifact-viewer modules, and tests make no model calls or real-home writes.
<!-- AC:END -->
