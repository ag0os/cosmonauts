---
id: TASK-395
title: Implement live domain binding switch command and non-mutating rejection
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:domain-authoring'
dependencies:
  - TASK-394
createdAt: '2026-06-23T21:14:55.952Z'
updatedAt: '2026-06-24T14:08:48.103Z'
---

## Description

Implementation Order step 8 foundation. Add the live `/domain-bind <role> <target-domain>` session surface, shared project live binding store mutation, and validation behavior for unavailable targets. This task owns B-010 and B-011 with exact markers in `tests/extensions/domain-bindings.test.ts`.

<!-- AC:BEGIN -->
- [x] #1 B-010 `/domain-bind ruby-coding ruby-experimental` records the switch in the session, updates the shared live binding store, and causes future agent/spawn/chain resolutions to use the bound target without restarting, proven in `tests/extensions/domain-bindings.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-010`.
- [x] #2 B-011 a live switch to a missing or inactive target reports an actionable unavailable-target error and leaves the previous effective binding unchanged, proven in `tests/extensions/domain-bindings.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-011`.
- [x] #3 Already-running agents and spawned children keep the resolved agent definition they started with after a successful live binding switch.
- [x] #4 The interactive session registers the domain-bindings extension so the command remains available in normal live session use.
<!-- AC:END -->
