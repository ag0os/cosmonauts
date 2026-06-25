---
id: TASK-393
title: Integrate binding-aware default-domain and orchestration access
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-392
createdAt: '2026-06-23T21:14:41.473Z'
updatedAt: '2026-06-24T13:58:08.385Z'
---

## Description

Implementation Order step 6. Thread requested-vs-resolved domain-role references through default lead lookup, chain/spawn orchestration, durable chain preparation, authorization, and model/thinking lookup. This task owns B-023 and builds on the project binding resolver from the prior tasks.

<!-- AC:BEGIN -->
- [x] #1 B-023 the default `domain` config value is treated as a bindable role across default lead resolution, domain chain lookup, and per-role model/thinking lookup, proven in `tests/runtime.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-023`.
- [x] #2 Chain stages, spawn configs, and durable chain records preserve the requested role string while carrying the resolved domain/agent reference used for execution.
- [x] #3 Binding-aware authorization and diagnostics use both requested and resolved references so existing consumers and allowlists do not require edits.
<!-- AC:END -->
