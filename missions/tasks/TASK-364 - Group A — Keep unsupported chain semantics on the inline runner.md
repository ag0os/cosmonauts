---
id: TASK-364
title: Group A — Keep unsupported chain semantics on the inline runner
status: To Do
priority: medium
labels:
  - 'group:a'
  - backend
  - testing
  - chain
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-363
createdAt: '2026-06-04T20:47:33.967Z'
updatedAt: '2026-06-04T20:47:33.967Z'
---

## Description

Owns Group A Implementation Order step 3. Worker should implement B-005 test-first and place `@cosmo-behavior plan:durable-frontend-migration#B-005` near the executable test. Scope is the inline-fallback predicate and legacy inline routing proof; no durable graph should be written for unsupported chain semantics.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is proven by `tests/orchestration/chain-routing.test.ts` > `keeps loop and completion-check chains on the legacy inline runner`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-005`.
- [ ] #2 The inline-fallback predicate routes loop stages using the planned `hasLoop = steps.some(s => !isParallelGroupStep(s) && s.loop)` condition after prompt injection.
- [ ] #3 Any stage completion check or caller-supplied completion label routes to the legacy `runChain` path and writes no durable graph.
- [ ] #4 Supported loop-free sequential, bracket, and fan-out chains remain eligible for the durable path established by prior Group A tasks.
- [ ] #5 Project-native tests for the touched chain routing behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
