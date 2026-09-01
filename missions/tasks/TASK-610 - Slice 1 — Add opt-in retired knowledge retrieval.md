---
id: TASK-610
title: Slice 1 — Add opt-in retired knowledge retrieval
status: To Do
priority: medium
labels:
  - backend
  - api
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-609
createdAt: '2026-09-01T20:08:09.892Z'
updatedAt: '2026-09-01T20:08:09.892Z'
---

## Description

Implement the Slice 1 retired-area read semantics across `lib/memory/knowledge-store.ts`, `lib/extensions/knowledge-surface/knowledge-tools.ts`, `lib/extensions/knowledge-surface/combined-context.ts`, and `tests/extensions/agent-memory.test.ts`. This task owns only B-003. Retired records remain outside combined-context injection and default recall; explicit `includeRetired` maps the derived physical retired location back to the original logical resource without implying user-scope mutation. This read-only task starts after the Slice 1 shared contracts and must add no movement/removal authority.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-003 is green in `tests/extensions/agent-memory.test.ts` > `excludes retired knowledge until recall explicitly opts in`, with exact marker `@cosmo-behavior plan:living-memory#B-003`; combined-context injection and default recall expose only live records, while explicit opt-in returns retired records with original logical resource, physical retired path, and retired state.
- [ ] #2 The retired subtree is excluded by default at the knowledge-store read boundary, opt-in paths are derived from contained originals rather than trusted persisted destinations, and user records are never mutation candidates.
- [ ] #3 The extracted read semantics preserve existing live retrieval, combined-context bytes, profile exclusion, and explicit-save behavior, with no relocation-capable or source-removal code introduced.
- [ ] #4 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit.
<!-- AC:END -->
