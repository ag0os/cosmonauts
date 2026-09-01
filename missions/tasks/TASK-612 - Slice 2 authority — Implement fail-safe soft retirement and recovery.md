---
id: TASK-612
title: Slice 2 authority — Implement fail-safe soft retirement and recovery
status: To Do
priority: high
labels:
  - backend
  - database
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-609
  - TASK-610
  - TASK-611
createdAt: '2026-09-01T20:08:50.408Z'
updatedAt: '2026-09-01T20:08:50.408Z'
---

## Description

Open Slice 2 only after every Slice 1 task is complete and the independent B-001 receipt floor is green. Implement Option C authority in `lib/memory/retirement-store.ts`, complete source-removal-capable operations in `lib/memory/durable-files.ts`, use bounded `lib/entity-file-lock.ts` options, and compose the dry-run/transaction branch in `lib/memory/living-memory.ts` with temp-project tests in `tests/memory/living-memory.test.ts`. This task is the Slice 2 shared authority task and owns B-002, B-011, B-015, and B-017. D-013 exact baselines, D-014 synced evidence/finite liveness (superseding D-006), D-017 healthy citation authority, D-009 manifest rounds, and D-021 manifest-state guards bind the transaction. Persisted paths are evidence, not deletion authority; derive contained destinations from originals. Unsupported hard links or directory sync fail closed.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Byte authority outranks index pressure, and no source byte may leave before synced representation. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; inability to prove exact baseline or synced-before-remove is a halt-and-escalate condition, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-002 is green in `tests/memory/living-memory.test.ts` > `soft-retires an eligible record with a complete durable manifest entry`, with exact marker `@cosmo-behavior plan:living-memory#B-002`; an authorized record moves byte-identically to its derived retired path only after a synced manifest records allowed reason, canonical date, and complete scope+path+digest evidence, and the result names the applied retirement and manifest.
- [ ] #2 B-011 is green in `tests/memory/living-memory.test.ts` > `previews only a stable snapshot and observes pending recovery without mutating it`, with exact marker `@cosmo-behavior plan:living-memory#B-011`; stable dry-run previews without lock or writes, while journal, live lock, or changed snapshot yields bounded fail-closed observation without model, write, or recovery.
- [ ] #3 B-015 is green in `tests/memory/living-memory.test.ts` > `recovers hard-stopped retirement at every durable commit boundary`, with exact marker `@cosmo-behavior plan:living-memory#B-015`; subprocess failpoints prove pre-commit rollback to live-only, post-manifest-sync roll-forward to manifest-plus-retired-only, synced journal cleanup, 50 ms retry/10-second timeout, and explicit release-unconfirmed committed failure with no unlocked continuation.
- [ ] #4 B-017 is green in `tests/memory/living-memory.test.ts` > `preserves profile authored memory and curated bytes across a full pass`, with exact marker `@cosmo-behavior plan:living-memory#B-017`; profile/authored/non-retired curated bytes stay identical, retired destination bytes exactly equal source, replacement content never enters knowledge, and synced evidence precedes every permitted removal.
- [ ] #5 Retirement authority revalidates exact promotion or human `ratifiedBaselines` bytes, complete receipts/citations, current digest, cap, lock, and manifest-state guards under the lock; unknown or later-curated baselines, inbound/incomplete inventories, changed bytes, active-retired live paths, and unchanged restored paths remain live with explicit conflicts; a restored path with changed bytes re-enters auto-retirement candidacy, and while suppressed it may only be targeted by a `retire` proposal.
- [ ] #6 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit; no relocation-capable commit exists without that evidence.
- [ ] #7 Unsupported same-filesystem hard-link or file/directory sync capability fails closed before any source removal — the run reports unsupported and halts, and a negative test proves no rename-first or readable-only fallback exists.
<!-- AC:END -->
