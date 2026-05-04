---
id: TASK-289
title: 'Plan 3: Inline-vs-detached behavioral parity test'
status: To Do
priority: high
labels:
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-278
  - TASK-284
createdAt: '2026-05-04T20:22:45.126Z'
updatedAt: '2026-05-04T20:22:45.126Z'
---

## Description

Implements Implementation Order step 13. Decision Log: D-P3-11. Quality Contract: QC-007.

Create `tests/driver/parity.test.ts` asserting behavioral equivalence between inline and detached modes on the same fixture spec.

**Parity definition (D-P3-11 — redefined after review F-001):**
Identical SHAs are NOT expected (commit timestamps differ). The test asserts:
1. Same normalized event sequence — same event types and ordering, excluding timestamps and lifecycle-ordering quirks.
2. Same task status transitions (To Do → In Progress → Done / Blocked, etc.).
3. Commits with identical subject lines and identical tree contents — but NOT identical SHAs.

**Cross-plan invariants relevant:**
- P3-INV-4: Status literals are Title Case: "To Do", "In Progress", "Done", "Blocked" — assert these exact strings in transitions.
- P3-INV-1: Both modes run via the same `runRunLoop` — behavioral equivalence is structurally guaranteed; this test validates it end-to-end.

<!-- AC:BEGIN -->
- [ ] #1 tests/driver/parity.test.ts runs the same 2-task fixture spec in both inline and detached modes using a mock/fixture backend.
- [ ] #2 Normalized event sequences (event types and ordering, excluding timestamps and lifecycle-ordering quirks) are identical between modes.
- [ ] #3 Task status transitions are identical between modes; status literals are Title Case per P3-INV-4.
- [ ] #4 Commits produced have identical subject lines and identical tree contents; SHA difference is explicitly asserted (NOT identical SHAs — per D-P3-11).
- [ ] #5 Test passes within CI timeout bounds.
<!-- AC:END -->
