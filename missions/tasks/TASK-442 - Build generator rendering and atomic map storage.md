---
id: TASK-442
title: Build generator rendering and atomic map storage
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-441
createdAt: '2026-07-03T14:13:04.930Z'
updatedAt: '2026-07-03T14:13:04.930Z'
---

## Description

Implementation order step 4, mechanical map/storage slice. Behavior ownership: owns B-002, B-004, B-008, and B-011 only. Implement generator orchestration for analyzed modules, OKF markdown rendering, dependents derivation, timestamp-stable rendering, and generated-map storage under `memory/architecture/`. Narrative lifecycle behavior is intentionally left to the follow-up narrative task. Planned-behavior tests must carry markers for the owned behavior IDs.

<!-- AC:BEGIN -->
- [ ] #1 B-002: generating a TypeScript fixture writes `memory/architecture/index.md` and module shards under `memory/architecture/modules/` with OKF frontmatter and the planned project-specific freshness keys.
- [ ] #2 B-002: the generated index lists every discovered module with a one-line narrative placeholder or narrative text and a dependency overview using the plan's OKF type vocabulary.
- [ ] #3 B-004: a no-source-change refresh with no completable pending narratives returns `unchanged`, preserves existing bytes and modification times, and reports no changed generated files.
- [ ] #4 B-008: analysis or bundle-rendering failures preserve any previous `memory/architecture/` content and leave no temp or partial replacement directory when no previous map exists.
- [ ] #5 B-011: an empty TypeScript project writes a valid OKF index with zero modules and an honest empty module inventory without requiring shard files.
- [ ] #6 Atomic bundle replacement recovers crash leftovers according to the plan and keeps generated-map ownership confined to `memory/architecture/`.
- [ ] #7 Tests for B-002, B-004, B-008, and B-011 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and use injected fakes/fixtures rather than model calls.
- [ ] #8 Generate records the turn-time stat fingerprint (the plan's two-tier freshness) in index frontmatter alongside the content-hash keys, and the generated bundle contains no OKF `log.md`.
<!-- AC:END -->
