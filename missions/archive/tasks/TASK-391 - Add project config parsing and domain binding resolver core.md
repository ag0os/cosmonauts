---
id: TASK-391
title: Add project config parsing and domain binding resolver core
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-390
createdAt: '2026-06-23T21:14:27.664Z'
updatedAt: '2026-06-24T13:42:25.434Z'
---

## Description

Implementation Order step 5 foundation. Extend project config with `activeDomains` and `domainBindings`, add the domain-role binding resolver contracts, and validate missing or inactive binding targets with actionable errors. This task owns B-007, B-009, and B-024 with exact behavior markers in the named tests.

<!-- AC:BEGIN -->
- [x] #1 B-007 an unbound role resolves to the same-named active domain and returns requested/resolved reference information, proven in `tests/domains/bindings.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-007`.
- [x] #2 B-009 a binding whose target domain is missing or inactive fails at startup/use with an error naming the role and target domain, proven in `tests/runtime.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-009`.
- [x] #3 B-024 malformed `domainBindings` entries warn with actionable diagnostics, are skipped, and do not prevent well-formed entries from applying, proven in `tests/config/loader.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-024`.
- [x] #4 `activeDomains` and well-formed `domainBindings` are parsed into project config without changing existing optional config field semantics.
<!-- AC:END -->
