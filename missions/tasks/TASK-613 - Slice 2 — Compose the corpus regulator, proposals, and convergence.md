---
id: TASK-613
title: 'Slice 2 — Compose the corpus regulator, proposals, and convergence'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-612
createdAt: '2026-09-01T20:09:13.154Z'
updatedAt: '2026-09-01T20:09:13.154Z'
---

## Description

Complete Slice 2 on top of the authority transaction. Compose Observer→Reflector→Dropper in `lib/memory/living-memory.ts` with `lib/memory/consolidation-proposals.ts` and `lib/memory/consolidation-receipts.ts`, using fake judgment and the injected index policy only after authority predicates. This task owns B-005, B-006, and B-016. D-003 requires typed sub-records to win and parents to become thin linked N=1 edits; human D-004 requires the 9608b54 fixture to remain live with its across-run warning preserved and only its fixed within-run claim removed. D-016 persists accepted normalized judgment before volatile output; D-020 uses represented-evidence recognition after completion; D-023 discharges only fully stale materialized receipts. No production record id is hard-coded and no live repository round is executed.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Byte authority, durable evidence, inbound citations, and bounded/lossy output outrank target pressure. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is green in `tests/memory/living-memory.test.ts` > `keeps cited 9608b54 live and emits the ruled edit-narrow proposal`, with exact marker `@cosmo-behavior plan:living-memory#B-005`; healthy canonical inbound evidence vetoes movement and the N=1 proposal preserves the cited across-run warning while removing only the fixed within-run claim; no production record id is hard-coded — the 9608b54 scenario runs against a temp fixture only.
- [ ] #2 B-006 is green in `tests/memory/living-memory.test.ts` > `writes evidence-bound merge and parent-edit proposals without changing knowledge`, with exact marker `@cosmo-behavior plan:living-memory#B-006`; canonical merge proposals have non-empty scope+path+digest inputs and complete replacements, parent rollups become thin linked N=1 edits, typed sub-record bytes remain authoritative, and no knowledge bytes change.
- [ ] #3 B-016 is green in `tests/memory/living-memory.test.ts` > `rehydrates accepted judgment and persisted evidence then converges to noop`, with exact marker `@cosmo-behavior plan:living-memory#B-016`; same-batch crash retry reuses durable output/paths without another model call, completed reruns recognize proposal/receipt/manifest evidence under changed batch keys, only fully stale materialized receipts discharge, and fresh stores complete pending durable recovery, never rediscover retired records, and converge to an honest no-model noop (episode-prune convergence is proven by TASK-616's integrated corpus-plus-episodic evidence).
- [ ] #4 The bounded fake-provider pipeline accepts only closed known-id outputs with complete evidence, persists normalized judgment before proposal/retirement materialization, treats a model-invoking zero-write pass as `ran`, and reports blocked/cap-deferred/target-unmet outcomes without weakening retirement authority.
- [ ] #5 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit; manual state/import review confirms the factory remains the sole composition owner and memory core has no outward implementation imports.
<!-- AC:END -->
