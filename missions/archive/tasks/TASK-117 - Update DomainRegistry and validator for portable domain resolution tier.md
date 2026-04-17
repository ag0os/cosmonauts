---
id: TASK-117
title: Update DomainRegistry and validator for portable domain resolution tier
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-113
  - TASK-115
  - TASK-116
createdAt: '2026-03-28T20:35:38.798Z'
updatedAt: '2026-03-28T20:41:43.388Z'
---

## Description

Extend `lib/domains/registry.ts` to add a portable domain resolution tier in `resolveCapability()` and add `listPortable()` method. Update `lib/domains/validator.ts` to check portable domains when validating capability/extension references. Update prompt assembly to use the resolver's three-tier lookup. Update tests in `tests/domains/registry.test.ts`, `tests/domains/validator.test.ts`, and `tests/domains/prompt-assembly.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 DomainRegistry.resolveCapability() checks agent domain → portable domains → shared in that order
- [ ] #2 DomainRegistry.listPortable() returns all domains with portable = true
- [ ] #3 Validator accepts a capability or extension name that exists in any portable domain as valid for any agent
- [ ] #4 Validator emits a warning when two portable domains provide the same capability name
- [ ] #5 Tests cover capability resolution across all three tiers and portable overlap warnings
<!-- AC:END -->

## Implementation Notes

Worker completed: extended DomainRegistry with three-tier resolveCapability() and listPortable(); updated validator for portable capability/extension acceptance and overlap warnings; updated tests. Status corrected by coordinator.
