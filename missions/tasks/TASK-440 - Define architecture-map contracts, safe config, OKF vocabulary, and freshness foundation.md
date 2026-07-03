---
id: TASK-440
title: >-
  Define architecture-map contracts, safe config, OKF vocabulary, and freshness
  foundation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-439
createdAt: '2026-07-03T14:12:46.808Z'
updatedAt: '2026-07-03T15:12:50.640Z'
---

## Description

Implementation order step 2. Behavior ownership: owns B-007 and B-018 only. Establish the stable architecture-map core contracts, safe project-config shape, OKF vocabulary/documentation, and freshness primitives that downstream analyzer, generator, CLI, extension, and viewer work must consume without inventing alternate types or formats. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-007` and `@cosmo-behavior plan:code-structure-map#B-018` near their executable tests.

<!-- AC:BEGIN -->
- [x] #1 Architecture-map public contracts and OKF type vocabulary are available from the stable core entry point and match the plan's shared data shapes and result union.
- [x] #2 Project configuration accepts only the planned `architectureMap` primitives, ignores malformed entries with warnings, and preserves existing config-loader behavior for unrelated config.
- [x] #3 B-018: unsafe `sourceRoots` and `moduleRoots` that are absolute, contain traversal, or resolve outside the project root are ignored with warnings while safe roots remain usable.
- [x] #4 B-007: freshness comparison can report `current`, `stale` with old/new hashes, and `missing`, and includes source plus map-relevant analyzer/config inputs rather than unrelated project config.
- [x] #5 The OKF vocabulary, generated layout, config escape hatch, and TypeScript-only W1 scope are documented in `docs/architecture-map.md` for downstream users, including that generated bundles never include an OKF `log.md` (reserved for curated W2+ records).
- [x] #6 Tests for B-007 and B-018 carry the required `@cosmo-behavior plan:code-structure-map#...` markers and use fixture inputs rather than model calls.
- [x] #7 Quality Contract: freshness decisions are reconstructed from persisted map/frontmatter and current disk state, not process-local cache.
- [x] #8 Freshness provides both planned tiers: content-hash `ProjectSnapshot` comparison as generate-time truth, and a stat fingerprint (hash over repo-relative path + size + mtimeMs of every included source and map-relevant config file) computable for recording in index frontmatter and for cheap turn-time comparison.
- [x] #9 `lib/architecture-map/index.ts` is registered in `fallow.toml`'s public entry list as a stable public entry point.
<!-- AC:END -->
