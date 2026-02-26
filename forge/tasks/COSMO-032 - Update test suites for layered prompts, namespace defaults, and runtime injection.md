---
id: COSMO-032
title: >-
  Update test suites for layered prompts, namespace defaults, and runtime
  injection
status: To Do
priority: medium
labels:
  - forge
  - testing
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-029
  - COSMO-031
createdAt: '2026-02-26T20:57:52.502Z'
updatedAt: '2026-02-26T20:57:52.502Z'
---

## Description

Update and extend tests to cover the new prompt architecture and runtime context behavior. Include definition assertions for new prompt arrays, namespace compatibility behavior, loader path coverage for new files, and spawner runtime injection behavior/order.

<!-- AC:BEGIN -->
- [ ] #1 tests/agents/definitions.test.ts assertions match new prompt arrays and namespace metadata
- [ ] #2 tests/agents/resolver.test.ts covers backward-compatible behavior when namespace is missing
- [ ] #3 tests/orchestration/agent-spawner.test.ts covers runtime layer inclusion, exclusion, and ordering
- [ ] #4 tests/prompts/loader.test.ts covers loading of the new prompt paths
- [ ] #5 Updated tests pass in the local suite for changed areas
<!-- AC:END -->
