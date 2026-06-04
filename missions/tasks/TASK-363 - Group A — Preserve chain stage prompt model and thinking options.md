---
id: TASK-363
title: Group A — Preserve chain stage prompt model and thinking options
status: To Do
priority: medium
labels:
  - 'group:a'
  - backend
  - testing
  - chain
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-362
createdAt: '2026-06-04T20:47:27.288Z'
updatedAt: '2026-06-04T20:47:27.288Z'
---

## Description

Owns Group A Implementation Order step 2. Worker should extend the compiler tests test-first for B-004 and place `@cosmo-behavior plan:durable-frontend-migration#B-004` near the executable test. Scope is prompt injection ordering and persisted chain backend metadata; no parser changes.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is proven by `tests/orchestration/chain-compiler.test.ts` > `persists chain stage options for prompt injection model and thinking`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-004`.
- [ ] #2 The first executable durable chain stage(s) receive the injected user prompt after `injectUserPrompt` and before compilation.
- [ ] #3 Each durable chain agent step persists enough role, prompt, model, thinking, domain, and runtime context metadata in backend options for the scheduler backend to run the same stage the inline runner would run.
- [ ] #4 Prompt/model/thinking persistence is delivered without changing `parseChain` behavior or moving chain-specific concerns into `lib/durable-runtime/*`.
- [ ] #5 Project-native tests for the touched chain compiler behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
