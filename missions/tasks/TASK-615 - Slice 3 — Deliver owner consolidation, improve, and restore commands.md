---
id: TASK-615
title: 'Slice 3 — Deliver owner consolidation, improve, and restore commands'
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-614
createdAt: '2026-09-01T20:09:47.526Z'
updatedAt: '2026-09-01T20:09:47.526Z'
---

## Description

Complete Slice 3 with the owner-facing memory CLI. Implement the injectable execute/render split in `cli/memory/subcommand.ts`, the in-memory no-tools Pi adapter in `cli/memory/judgment-provider.ts`, top-level `memory` dispatch in `cli/main.ts`, pointer validation/lifecycle integration with `lib/memory/consolidation-proposals.ts`, and restoration annotation through the receipt/retirement interfaces. Cover `tests/cli/memory/subcommand.test.ts`, `tests/cli/memory/main-dispatch.test.ts`, and the restoration seam in `tests/memory/living-memory.test.ts`. This task owns B-004, B-007, and B-013. D-005 defines full/deterministic/model/output flags and manual consent; D-015 defines reachable improve/restore exits; D-009/D-021 make restoration an append-only finite-lock annotation after a human `git mv`, never a machine move. The judgment adapter uses one bounded, no-tools in-memory session and no runtime/model import enters `lib/memory/`.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; improve commands validate a human-supplied existing pointer but perform no product edit; hard deletion is solely a human `retiredRecords` ledger act. Restore only validates a prior human move and appends history. Ratified intent/ACs and human decisions D-001..D-005 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-004 is green in `tests/memory/living-memory.test.ts` > `annotates a human restoration and reserves hard deletion for the ledger`, with exact marker `@cosmo-behavior plan:living-memory#B-004`; restore validates active digest/live byte identity and retired absence, appends a synced later event under finite lock, preserves retrieval re-entry and veto guards, never moves bytes, and hard deletion passes only through human `retiredRecords`.
- [ ] #2 B-007 is green in `tests/cli/memory/subcommand.test.ts` > `actions or rejects improve proposals through a reachable closed lifecycle`, with exact marker `@cosmo-behavior plan:living-memory#B-007`; valid roadmap/task/prompt/skill pointers action then close, rejection closes with reason, same resolution is idempotent, conflicts/invalid pointers fail, and neither path creates or moves knowledge.
- [ ] #3 B-013 is green in `tests/cli/memory/subcommand.test.ts` > `runs renders validates and cancels manual consolidation without autonomy`, with exact marker `@cosmo-behavior plan:living-memory#B-013`; full/no-model/dry-run and human/plain/JSON modes delegate exact options/AbortSignal, JSON stdout stays clean, conflicting flags fail before access, and exits are zero only for confirmed ran/noop outcomes.
- [ ] #4 `tests/cli/memory/main-dispatch.test.ts` proves top-level `memory` dispatch does not fall through to interactive mode, and the no-tools judgment adapter performs at most one bounded request with cancellation/invalid output failing before mutation and no additional manual feature gate.
- [ ] #5 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit; timeout, race, release-unconfirmed, invalid-pointer, conflict, and cancellation negatives remain nonzero and fail closed.
<!-- AC:END -->
