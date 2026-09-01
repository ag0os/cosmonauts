---
id: TASK-616
title: Slice 4 — Finalize the public consolidate contract and memory documentation
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-614
  - TASK-615
createdAt: '2026-09-01T20:10:08.686Z'
updatedAt: '2026-09-01T20:10:08.686Z'
---

## Description

Integrate the completed living-memory system as Slice 4 without taking ownership from earlier behavior tasks. Finalize `lib/memory/types.ts`, `lib/memory/index.ts`, `lib/memory/knowledge-store.ts`, `lib/memory/markdown-store.ts`, existing architecture adapters, `tests/memory/interface.test.ts`, and `docs/memory.md`; re-pin the full-source `types.ts` SHA-256 in the established seam while leaving `lib/architecture-map/retrieval.ts` byte-identical and its pin unchanged. This task owns B-012 and B-020. Exercise the full/no-model/dry corpus+episode flow through public contracts and verify all earlier exact markers/files as artifact-conformance evidence without re-owning their behaviors. D-018's sole factory/inward dependencies, D-025's markdown noop, and all eight plan-specific Quality Contract assertions bind this final release unit.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Documentation must preserve default noops, profile/explicit-save authority, and every ratified trust boundary. Ratified intent/ACs and human decisions D-001..D-005 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-012 is green in `tests/memory/interface.test.ts` > `exposes exact living-memory outcomes through configured knowledge consolidate only`, with exact marker `@cosmo-behavior plan:living-memory#B-012`; configured results truthfully distinguish ran/noop/failed and report all planned details, timeout/cancel/pre-commit/release-unconfirmed states remain honest, and unconfigured knowledge/markdown/architecture noops stay exact.
- [ ] #2 B-020 is green in `tests/memory/interface.test.ts` > `documents living-memory trust outlets invocation durability and recovery`, with exact marker `@cosmo-behavior plan:living-memory#B-020`; `docs/memory.md` covers every named source/judgment/index, cap/order, proposal/owner command, exact-byte receipt/citation/retirement/restoration/deletion, durability/lock, retrieval, CLI/dry-run/noop, and v1 payload contract while removing only stale configured-store noop text.
- [ ] #3 The final interface seam re-pins the changed `lib/memory/types.ts` full-source digest in the same commit, leaves `lib/architecture-map/retrieval.ts` byte-identical with its existing pin, and preserves default stores and explicit-save/profile behavior.
- [ ] #4 Integrated temp-project evidence exercises corpus plus episodic sources in full, deterministic-only, and dry modes with cap/index pressure, byte snapshots, accepted receipts, fresh-store convergence, finite lock/release outcomes, and no real manifest/proposal/receipt residue.
- [ ] #5 Artifact-conformance verification finds every B-001..B-021 named root-relative test file and exact `@cosmo-behavior plan:living-memory#B-###` marker, while each behavior remains owned only by its designated earlier or current slice task.
- [ ] #6 The ordered Quality Contract passes project-native correctness and artifact-conformance gates; named mutation-style negatives run, and degraded manual reviews confirm no duplicate writer/renderer, no implementer-invented state transition, no outward core import, and no dead replacement path/export.
- [ ] #7 Project-native universal correctness evidence passes after every commit, the Slice 0 B-001 receipt test and exact marker remain green at every commit, live `knowledge/` remains unchanged, `knowledgeSurface` remains enabled, and final scope contains no live round, TTL, OM, scheduling, user mutation, or new knowledge type.
<!-- AC:END -->
