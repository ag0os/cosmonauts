---
id: TASK-623
title: 'Review fix: remove duplicate living-memory evidence scans'
status: Done
priority: medium
labels:
  - backend
  - testing
  - review-fix
  - 'review-round:1'
  - 'plan:living-memory'
dependencies:
  - TASK-622
createdAt: '2026-09-02T18:48:26.597Z'
updatedAt: '2026-09-07T14:04:06.683Z'
---

## Description

Remediate performance finding PF-003 from quality round 1 with the narrowest change that preserves mandatory fresh under-lock validation. A non-dry pass currently invokes retirement apply with an empty candidate list but still folds receipts/scans citations; proposal evidence and materializations independently parse the same proposal directory; receipt histories are folded repeatedly. Eliminate avoidable duplicate work without caching across mutation boundaries or weakening INV-001/INV-002 revalidation.

<!-- AC:BEGIN -->
- [x] #1 A clean empty recovery checks journal/recovery state without scanning citations or performing candidate authorization.
- [x] #2 One consolidation phase reads/parses proposal materializations once and derives both materialization and represented-evidence views from that result.
- [x] #3 Folded inventories are reused only within a safe phase; mandatory fresh receipt/citation revalidation under the retirement lock remains intact.
- [x] #4 Regression tests distinguish skipped empty recovery work and single-phase proposal reads from required under-lock revalidation.
- [x] #5 All living-memory behavior tests, lint, typecheck, and full test suite pass.
<!-- AC:END -->
