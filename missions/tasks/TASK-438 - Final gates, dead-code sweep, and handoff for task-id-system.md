---
id: TASK-438
title: 'Final gates, dead-code sweep, and handoff for task-id-system'
status: To Do
priority: high
labels:
  - testing
  - 'plan:task-id-system'
dependencies:
  - TASK-432
  - TASK-433
  - TASK-435
  - TASK-436
  - TASK-434
  - TASK-437
createdAt: '2026-06-30T17:36:43.764Z'
updatedAt: '2026-06-30T17:36:43.764Z'
---

## Description

Run the project gates green (typecheck, lint, full test) and verify the unbound quality-contract gates: no runtime references to lastIdNumber outside legacy-stripping tests/docs (grep); archive scanning is create-only (boundary); active+archived listing share one helper (duplication); removed create-path imports such as parseIdNumber do not linger (dead-code). Confirm every marker B-001..B-012 is present in the referenced tests. Record completion evidence.

<!-- AC:BEGIN -->
- [ ] #1 typecheck, lint, and the full test suite pass with all B-001..B-012 behaviors green
- [ ] #2 no runtime references to lastIdNumber remain outside legacy-stripping/test/doc code (grep-verified) and no orphaned create-path imports linger
- [ ] #3 archive scanning is confined to the create-only allocation helper; active query/lookup paths remain active-only
- [ ] #4 every marker @cosmo-behavior plan:task-id-system#B-001..#B-012 is present in the referenced tests
<!-- AC:END -->
