---
id: TASK-413
title: Apply main fallback semantics to framework domain consumers
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-412
createdAt: '2026-06-26T15:43:31.309Z'
updatedAt: '2026-06-29T17:25:29.468Z'
---

## Description

Replace local `coding` fallback semantics at the planned framework consumer seams with the default-domain helper and add the source default gate after those replacements. This task owns B-003 through B-009. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-003` through `#B-009` for the behavior each test proves.

<!-- AC:BEGIN -->
- [x] #1 B-003 session prompt assembly uses `main` resources for domainless definitions without requiring a `coding` directory.
- [x] #2 B-004 session extension lookup resolves domainless extension paths under `main/extensions/` as the primary fallback.
- [x] #3 B-005 session skill visibility treats `main` as the requester domain for domainless definitions while hiding other domains' internal skills appropriately.
- [x] #4 B-006 direct skill visibility resolution defaults an omitted requester domain to `main`, not `coding`.
- [x] #5 B-007 source-agent package prompt assembly uses `main` as the final fallback for domainless source agents while preserving package identity.
- [x] #6 B-008 dump-prompt domain fallback is testable through an injectable helper, returns `main` for domainless definitions, and shares the no-default-domain failure behavior.
- [x] #7 B-009 source-scan coverage rejects framework `coding` domain defaults in the planned `lib/` and `cli/` sources after all consumer replacements while preserving explicit carve-outs.
<!-- AC:END -->
