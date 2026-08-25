---
id: TASK-587
title: Checkpoint B2 harness CLI behavior in arbitrary temporary roots
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-586
createdAt: '2026-08-25T23:05:00.585Z'
updatedAt: '2026-08-25T23:05:00.585Z'
---

## Description

Implementation Order Checkpoint B2; dependency barrier with no B-### ownership. Verify the CLI integration after B1 and before generated bundle work. This checkpoint verifies D-004/D-007/D-019 behavior already owned by implementing tasks and cannot substitute for their acceptance criteria. All writes stay inside temporary/ignored roots; both live Claude commands remain untouched.

<!-- AC:BEGIN -->
- [ ] #1 Harness registration, selector validation, default/partial semantics, row reporting, and normal/check exit behavior pass in arbitrary temporary project and home roots.
- [ ] #2 Compatibility skills listing/export passes through shared core behavior with destructive copier and local target vocabularies absent.
- [ ] #3 Check and every invalid CLI combination create no roots, locks, manifests, journals, targets, links, or mtimes.
- [ ] #4 Command link rejection occurs before any write, and no force/adopt option is exposed.
- [ ] #5 No live migration, generated bundle rewrite, native command creation, or modification to either active live command occurs.
<!-- AC:END -->
