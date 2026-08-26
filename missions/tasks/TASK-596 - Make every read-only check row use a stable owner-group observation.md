---
id: TASK-596
title: Make every read-only check row use a stable owner-group observation
status: To Do
priority: medium
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:harness-adapters'
dependencies: []
createdAt: '2026-08-26T12:24:22.520Z'
updatedAt: '2026-08-26T12:24:22.520Z'
---

## Description

Remediate integration finding I-003 and the overlapping concrete portion of performance finding PRF-001 against B-006/D-004. The outer check path currently bypasses sibling-journal and before/after stability observation for source-removed, source-unavailable, foreign-owner, incomplete, forget, and transfer rows. Implement one lock-free owner-group stable manifest/journal window around selected target observations so every row receives pending-journal/concurrent-change precedence without N full manifest rereads. Preserve all four public states and no-write semantics. Do not modify existing plan artifacts.

<!-- AC:BEGIN -->
- [ ] #1 Source-removed, source-unavailable, foreign-owner, incomplete, forget, and transfer-related check rows detect pending journals and concurrent manifest/journal changes and exit nonzero.
- [ ] #2 The check path remains lock-free and does not create or mutate roots, locks, journals, manifests, targets, timestamps, files, links, or mtimes.
- [ ] #3 A selected owner group uses one coherent manifest/journal before-and-after stability window rather than rereading the full manifest once per row.
- [ ] #4 Integration tests mutate manifest and journal observations for catalogue-backed and stale/non-catalogue rows and fail if any outer check seam bypasses the stable observation contract.
- [ ] #5 All existing harness-adapter and project-native checks remain green.
<!-- AC:END -->
