---
id: TASK-570
title: Cover recall-owner collisions at every session seam
status: To Do
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - testing
  - 'plan:knowledge-surface'
dependencies: []
createdAt: '2026-08-20T18:15:54.978Z'
updatedAt: '2026-08-20T18:15:54.978Z'
---

## Description

Remediate merged findings F-004/I-003 from quality round 1. The collision helper is unit-tested, but initial CLI, `/agent` switch, and spawned session callers are not protected by finding-anchored regression tests. Add executable seam coverage while preserving unrelated tools and D-023 registration/authorization behavior.

<!-- AC:BEGIN -->
- [ ] #1 B-005 initial CLI assembly rejects a framework-plus-arbitrary `recall` owner collision before session use and names both source paths.
- [ ] #2 B-005 `/agent` switch rejects the same collision before replacing the active session and names both source paths.
- [ ] #3 B-005 spawned-session assembly rejects the same collision before session use and names both source paths.
- [ ] #4 Success cases at each seam prove unrelated extension tools remain callable when no recall collision exists.
- [ ] #5 Tests retain the B-005 behavior marker and do not widen authored-memory or architecture authorization.
<!-- AC:END -->
