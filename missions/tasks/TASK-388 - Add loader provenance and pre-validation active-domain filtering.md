---
id: TASK-388
title: Add loader provenance and pre-validation active-domain filtering
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-386
  - TASK-387
createdAt: '2026-06-23T21:14:03.525Z'
updatedAt: '2026-06-24T13:29:24.000Z'
---

## Description

Implementation Order step 2. Add provenance-aware domain provider loading, filter inactive providers before validation/merge/conflict checks, and make same-precedence active domain ID conflicts explicit. This task owns B-013 and B-017; each behavior requires the named test file and exact marker.

<!-- AC:BEGIN -->
- [x] #1 B-013 same-precedence active providers with the same manifest id fail with an explicit conflict naming the domain id and both source origins, while different-precedence override/merge semantics continue, proven in `tests/domains/loader.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-013`.
- [x] #2 B-017 inactive domains are filtered before validation and same-precedence conflict checks, while binding targets still must be present in the filtered active set, proven in `tests/runtime.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-017`.
- [x] #3 Loaded domains expose provenance sufficient for diagnostics without making inactive malformed/conflicting providers participate in active runtime validation.
- [x] #4 Existing domain loading tests for higher-precedence customization remain valid after provenance is introduced.
<!-- AC:END -->
