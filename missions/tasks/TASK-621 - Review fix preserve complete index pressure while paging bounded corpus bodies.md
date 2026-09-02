---
id: TASK-621
title: >-
  Review fix: preserve complete index pressure while paging bounded corpus
  bodies
status: In Progress
priority: high
assignee: worker
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:living-memory'
dependencies: []
createdAt: '2026-09-02T18:48:12.415Z'
updatedAt: '2026-09-02T18:59:40.941Z'
---

## Description

Remediate performance finding PF-001 from quality round 1. The production corpus source currently slices the complete project+user result to the newest 50 and the consolidator computes represented work/index pressure only from that bounded snapshot. This can permanently starve omitted records and makes the >50-row pressure branch unreachable. Preserve INV-005 count bounds and INV-007 index-bound measurement. Separate complete metadata/index inventory from the capped body/judgment batch and ensure subsequent passes admit unrepresented project records. Make the narrowest coherent change; do not widen machine mutation authority or user-scope mutation.

<!-- AC:BEGIN -->
- [x] #1 A corpus with more than 50 records supplies complete project+user metadata to KnowledgeIndexPressurePolicy while admitting at most 50 bodies for judgment in one pass.
- [x] #2 After the first 50 records are represented, a subsequent pass can admit later unrepresented project records instead of returning a permanent noop.
- [x] #3 User records contribute to complete target measurement but never become mutation candidates.
- [x] #4 Regression tests prove the 51-row pressure case and multi-pass paging/starvation behavior.
- [x] #5 All existing B-001..B-021 tests, lint, and typecheck pass without weakening caps or retirement authority.
<!-- AC:END -->

## Implementation Notes

Implemented PF-001 by separating complete source inventory metadata from bounded project body snapshots, paging production corpus collection past represented digests, measuring pressure and stale-receipt liveness against the complete inventory, and excluding user-scope bodies from judgment/mutation. Added 51-row, user-authority, and multi-pass starvation regressions. Verified `bun run test` (3009 tests), `bun run lint`, and `bun run typecheck`. Changed-scope audit at base `888771f7cec2ae58a43f7eb5ca1cfbc6a3889142` was unavailable (`unbound`, `execution-not-consented`); this is unavailable evidence, not a clean result.
