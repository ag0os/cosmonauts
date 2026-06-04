---
id: TASK-366
title: Group A — Route chain_run through durable or inline execution
status: To Do
priority: medium
labels:
  - 'group:a'
  - backend
  - api
  - testing
  - chain
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-365
createdAt: '2026-06-04T20:47:49.805Z'
updatedAt: '2026-06-04T20:47:49.805Z'
---

## Description

Owns Group A Implementation Order step 5. Worker should implement B-007 test-first and place `@cosmo-behavior plan:durable-frontend-migration#B-007` near the executable test. Scope is the `chain_run` tool surface and the durable chain runner entry needed by that tool.

<!-- AC:BEGIN -->
- [ ] #1 B-007 is proven by `tests/extensions/orchestration-chain-tool-durable.test.ts` > `routes loop-free chain_run through the durable graph and loop chains inline`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-007`.
- [ ] #2 Supported sequential, bracket, and fan-out `chain_run` expressions compile and execute through the durable scheduler path while preserving the tool's final result and progress response shape.
- [ ] #3 Unsupported loop, completion-check, or completion-label `chain_run` expressions still call the legacy `runChain` inline path.
- [ ] #4 Durable chain results are reconstructed from persisted graph/step records and adapted events rather than an in-memory-only latest-result map.
- [ ] #5 Project-native tests for the touched chain tool/runner behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
