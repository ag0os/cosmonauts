---
id: TASK-608
title: Slice 0 — Establish the read-only retirement receipt floor
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies: []
createdAt: '2026-09-01T20:07:40.079Z'
updatedAt: '2026-09-01T20:07:40.079Z'
---

## Description

Implement only the Slice 0 receipt/audit release unit from the living-memory plan. Extend the frozen seed audit in `tests/memory/interface.test.ts`, add the read-only `lib/memory/retirement-receipts.ts` fold, and land the receipt-facing documentation needed to explain manifest-backed relocation, `retiredRecords`, and human-pinned `ratifiedBaselines`. Preserve every existing metadata/body/destination/index assertion. D-013/D-022 require exact destination-byte authority and fail-closed human ledger baselines; no machine-generated baseline is ratified. This slice ships independently and before any relocation-capable code (INV-003).

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows the deviation protocol's halt-and-escalate route, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is green in `tests/memory/interface.test.ts` > `accepts only manifest-backed relocation and ledger-backed hard deletion`, carrying exact marker `@cosmo-behavior plan:living-memory#B-001` near the executable test and proving exact-byte manifest relocation, ledger-only hard deletion, and fail-closed serialization/path/digest/body/history mutations.
- [ ] #2 The receipt inventory folds healthy promotion ledgers including `retiredRecords` and `ratifiedBaselines` plus ordered retirement/restoration manifests, while malformed, duplicate, noncontiguous, unknown, unsafe, or unreadable state remains unhealthy and cannot authorize absence.
- [ ] #3 Slice 0 contains no function capable of linking, renaming, unlinking, deleting, or otherwise relocating a path under `knowledge/`, and the existing frozen metadata/body/destination/index protections remain intact.
- [ ] #4 Project-native universal correctness evidence passes after every commit; once B-001 lands it remains green for every commit in this slice and all later slices, with no relocation-capable commit permitted while its receipt evidence is red.
<!-- AC:END -->
