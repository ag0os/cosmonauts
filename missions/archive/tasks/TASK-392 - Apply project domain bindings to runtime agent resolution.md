---
id: TASK-392
title: Apply project domain bindings to runtime agent resolution
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-391
createdAt: '2026-06-23T21:14:34.678Z'
updatedAt: '2026-06-24T13:47:24.098Z'
---

## Description

Complete Implementation Order step 5 for project-config binding use in the runtime. Qualified agent references should preserve the caller's requested role while resolving execution through the bound target domain. This task owns B-008 and requires the exact marker in the named runtime test.

<!-- AC:BEGIN -->
- [x] #1 B-008 project config binding redirects `ruby-coding/worker` to the bound target domain without consumer edits, and subagent allowlists containing the requested reference remain valid, proven in `tests/runtime.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-008`.
- [x] #2 The runtime exposes and uses a binding resolver for qualified agent references while preserving requested-vs-resolved reference data for downstream authorization and diagnostics.
- [x] #3 Existing unbound qualified agent resolution keeps same-named-domain behavior after project binding support is enabled.
<!-- AC:END -->
