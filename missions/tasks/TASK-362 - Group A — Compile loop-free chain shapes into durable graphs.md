---
id: TASK-362
title: Group A — Compile loop-free chain shapes into durable graphs
status: To Do
priority: high
labels:
  - 'group:a'
  - backend
  - testing
  - chain
  - 'plan:durable-frontend-migration'
dependencies: []
createdAt: '2026-06-04T20:47:20.177Z'
updatedAt: '2026-06-04T20:47:20.177Z'
---

## Description

Owns Group A Implementation Order step 1. Worker should implement test-first against B-001, B-002, and B-003, placing the exact `@cosmo-behavior plan:durable-frontend-migration#B-###` marker near each executable test. Scope stays in the chain compiler seam; no parser behavior changes and no Drive scope.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is proven by `tests/orchestration/chain-compiler.test.ts` > `compiles sequential stages into a dependency chain`: sequential parsed stages lower to ordered durable agent steps with the second depending on the first, with marker `@cosmo-behavior plan:durable-frontend-migration#B-001`.
- [ ] #2 B-002 is proven by `tests/orchestration/chain-compiler.test.ts` > `compiles bracket groups as sibling steps and joins the next frontier`: bracket members lower to parallel sibling agent steps sharing the prior frontier, and the following step depends on all siblings, with marker `@cosmo-behavior plan:durable-frontend-migration#B-002`.
- [ ] #3 B-003 is proven by `tests/orchestration/chain-compiler.test.ts` > `compiles fan-out as same-role sibling steps`: fan-out lowers to exactly the requested count of same-role sibling steps with shared dependencies and next-frontier participation, with marker `@cosmo-behavior plan:durable-frontend-migration#B-003`.
- [ ] #4 The chain compiler output has deterministic step IDs and frontier-folded dependencies while `parseChain` behavior remains unchanged.
- [ ] #5 Project-native tests for the touched chain compiler behavior pass, and project-native lint/typecheck gates remain green with durable-runtime modules still frontend-agnostic.
<!-- AC:END -->
