---
id: COSMO-030
title: Add runtime spawn context contract to orchestration types and tool schema
status: To Do
priority: high
labels:
  - forge
  - backend
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-029
createdAt: '2026-02-26T20:57:40.788Z'
updatedAt: '2026-02-26T20:57:40.788Z'
---

## Description

Introduce structured runtime context metadata for spawned agents. Extend SpawnConfig with runtimeContext and update orchestration extension schema so spawn_agent can receive optional sub-agent context fields without breaking existing calls.

<!-- AC:BEGIN -->
- [ ] #1 lib/orchestration/types.ts defines SpawnRuntimeContext and exposes runtimeContext on SpawnConfig
- [ ] #2 extensions/orchestration spawn_agent schema accepts optional runtimeContext fields
- [ ] #3 Existing spawn_agent invocations continue to work when runtimeContext is omitted
- [ ] #4 Runtime context fields are validated and forwarded to the spawner
<!-- AC:END -->
