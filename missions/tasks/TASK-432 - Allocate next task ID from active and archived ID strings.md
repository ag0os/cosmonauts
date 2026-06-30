---
id: TASK-432
title: Allocate next task ID from active and archived ID strings
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:task-id-system'
dependencies: []
createdAt: '2026-06-30T17:36:17.304Z'
updatedAt: '2026-06-30T17:36:17.304Z'
---

## Description

Refactor lib/tasks/id-generator.ts to allocate from a supplied list of ID strings (the union of active + archived task IDs) with no counter. generateNextId shifts from Task[] to readonly string[]; it must not read or consider lastIdNumber; uses config.prefix (default TASK) + zeroPadding. Keep a compat wrapper only if a consumer needs it. Owns B-001, B-002 — tests must carry markers @cosmo-behavior plan:task-id-system#B-001 and #B-002.

<!-- AC:BEGIN -->
- [ ] #1 B-001: an empty ID set returns the first configured ID (TASK-1, or TASK-001 with zeroPadding 3)
- [ ] #2 B-002: next ID is highest+1 across the supplied union, ignoring other prefixes, parsing case-insensitively, without filling gaps
- [ ] #3 Allocation no longer reads or considers lastIdNumber
- [ ] #4 id-generator.ts imports no filesystem, parser, CLI, or task-manager modules (stays pure)
- [ ] #5 generateNextId/extractIdNumbers tests carry the #B-001 and #B-002 markers and pass
<!-- AC:END -->
