---
id: TASK-412
title: Introduce framework default-domain helper
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-26T15:43:24.358Z'
updatedAt: '2026-06-26T15:47:25.171Z'
---

## Description

Establish the central default-domain contract for framework fallback semantics. This task owns B-001 and B-002. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-001` and `#B-002`.

<!-- AC:BEGIN -->
- [ ] #1 B-001 default-domain resolution returns `main` for domainless synthetic definitions when `main` is installed.
- [ ] #2 B-002 resolver-backed default-domain resolution fails with an actionable no-default-domain message when `main` is unavailable and never fabricates `coding`.
- [ ] #3 The default-domain helper contract is centralized and available for downstream framework consumers without depending on CLI, prompt, package, or session modules.
<!-- AC:END -->
