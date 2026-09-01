---
id: TASK-609
title: Slice 1 contract — Define bounded sources and the core composition seam
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-608
createdAt: '2026-09-01T20:07:58.275Z'
updatedAt: '2026-09-01T20:07:58.275Z'
---

## Description

Begin Slice 1 after the receipt floor. Establish the inward-facing contracts in `lib/memory/types.ts`, `lib/memory/index.ts`, `lib/memory/consolidation-sources.ts`, and the `createLivingMemoryConsolidator()` composition seam in `lib/memory/living-memory.ts`; wire optional configured knowledge-store delegation while keeping markdown and architecture stores' exact noops source-compatible. This task owns Slice 1 behaviors B-010 and B-018. It may provide only skeleton/contract support for later-owned B-012 and B-014 and must not claim their markers green. D-010 fixes immutable capped snapshots and the 50 corpus/50 episode, 25 observation, 10 proposal, 5 retirement, one-model-request limits; D-018 makes the core factory the sole cross-worker contract owner. `lib/memory/` must not import CLI, Pi, extension implementations, agents, orchestration, domains, or tasks.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-018 is green in `tests/memory/living-memory.test.ts` > `accepts valid fake source snapshots and rejects contract violations`, with exact marker `@cosmo-behavior plan:living-memory#B-018`; valid adapters need no store/Pi/OM/pipeline import or concrete-source switch, while over-limit output, duplicate ids, unsafe paths, invalid digests, and unsupported scopes fail at the boundary.
- [ ] #2 B-010 is green in `tests/memory/living-memory.test.ts` > `rejects source contract violations and enforces bounded lossy passes`, with exact marker `@cosmo-behavior plan:living-memory#B-010`; all inlet/outlet/model caps and lossy validation are enforced, deferred work is reported, and a healthy empty pass is a no-model, no-write `noop`.
- [ ] #3 The exported source, judgment, limits, evidence, index-pressure, consolidator, options, recovery, and discriminated result contracts — including the optional `MemoryQuery.includeRetired` extension TASK-610 consumes — match the plan's exact closed shapes, and `createLivingMemoryConsolidator()` is the sole dependency-injected composition seam.
- [ ] #4 Configured knowledge stores delegate through the optional consolidator, while unconfigured knowledge, markdown, and architecture stores retain exact honest noops and optional consolidate arguments remain source-compatible; later-owned B-012/B-014 markers are not claimed by this task.
- [ ] #5 No live knowledge or episode removal capability exists at the Slice 1 contract boundary, and manual import review confirms dependency direction remains inward with no core import of CLI/Pi/task/domain/extension implementations.
- [ ] #6 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit.
- [ ] #7 Every commit that changes `lib/memory/types.ts` re-pins its full-source SHA-256 in the existing profile-playbooks seam-stability test in `tests/memory/interface.test.ts` in the same commit; the pin assertion is never removed or weakened, and `lib/architecture-map/retrieval.ts` remains byte-identical with its pin unchanged.
<!-- AC:END -->
