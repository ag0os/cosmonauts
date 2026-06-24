---
id: TASK-399
title: >-
  Restore recursive and extra skill visibility under internal deny-list
  filtering
status: In Progress
priority: medium
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - skills
  - domains
  - regression
  - 'plan:domain-authoring'
dependencies: []
createdAt: '2026-06-24T14:28:16.909Z'
updatedAt: '2026-06-24T14:32:32.354Z'
---

## Description

Review round 1 remediation for F-001 from missions/reviews/review-round-1.md. Wildcard skill filtering now allowlists only LoadedDomain.skills, which misses recursive Pi-discovered skills such as bundled/coding/skills/languages/rails/rails-api and can remove project/user skillPath entries. Implement the narrowest fix that preserves public recursive skills and extra/project skill paths while still hiding names explicitly listed in manifest.internal.skills for cross-domain consumers.

<!-- AC:BEGIN -->
- [x] #1 Wildcard coding agents can see a nested public skill such as rails-api when no internal deny-list names it.
- [x] #2 Project/user skillPath skills are not removed solely because they are absent from LoadedDomain.skills.
- [x] #3 Internal deny-list filtering for skills still hides explicitly named internal skills from cross-domain agents and preserves same-domain access.
- [x] #4 Regression tests cover the recursive public skill and extra/project skill-path visibility cases.
<!-- AC:END -->

## Implementation Notes

Implemented deny-list-based skill visibility so wildcard skill catalogs filter only names explicitly hidden by manifest.internal.skills for cross-domain consumers. Added regression coverage for recursive public skills and extra/project skill-path skills remaining visible while internal skills remain hidden cross-domain and available same-domain. Verification passed: bun run test, bun run lint, bun run typecheck.
