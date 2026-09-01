---
id: TASK-614
title: Slice 3 contract — Add the episodic inlet and autonomy payload adapter
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-612
  - TASK-613
createdAt: '2026-09-01T20:09:29.826Z'
updatedAt: '2026-09-01T20:09:29.826Z'
---

## Description

Begin Slice 3 after both Slice 2 tasks. Add the bounded episodic source/finalization path in `lib/memory/consolidation-sources.ts`, complete accepted-output/proposal durability in `lib/memory/consolidation-receipts.ts` and proposal persistence, and expose the data-only `lib/memory/consolidation-job.ts` adapter through the shared factory/store seam. This task owns B-019 and B-014 and is the Slice 3 contract/integration task that precedes the owner-facing CLI task. D-025 keeps episode work behind the configured knowledge-store consolidator while `markdown-store.consolidate()` remains an exact noop. D-016 reuses accepted output on hard-stop retry; D-014 requires proposal file and parent sync before episode unlink. D-018 forbids a second factory, and the payload imports no autonomy host or scheduling state.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. The autonomy artifact is a payload adapter only—no timer, trigger, retry policy, gate, host state, or embedded absolute root. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-019 is green in `tests/memory/living-memory.test.ts` > `syncs accepted folded note proposals before pruning unchanged episodes`, with exact marker `@cosmo-behavior plan:living-memory#B-019`; bounded episodes fold lossily into fewer note proposals, accepted receipt and proposal file/parent entries sync before safe-prune unlink/parent sync, changed or write-failed episodes remain, and retry reuses output without another model call.
- [ ] #2 B-014 is green in `tests/memory/living-memory.test.ts` > `executes the versioned project payload through the shared factory and store seam`, with exact marker `@cosmo-behavior plan:living-memory#B-014`; the closed v1 project payload validates kind/version/scope before dependency access and invokes the same factory/public store seam without host imports, scheduling data, or absolute root.
- [ ] #3 The episodic inlet operates only inside configured knowledge-store consolidation; markdown and architecture consolidate methods retain exact noops, profile/authored memory is untouched, and no second lock/receipt/pipeline machinery is introduced.
- [ ] #4 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit; hard-stop and sync negatives prove no episode disappears without synced representation.
<!-- AC:END -->
