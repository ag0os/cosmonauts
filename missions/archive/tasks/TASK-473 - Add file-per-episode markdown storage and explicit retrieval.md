---
id: TASK-473
title: Add file-per-episode markdown storage and explicit retrieval
status: Done
priority: high
labels:
  - backend
  - database
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-472
createdAt: '2026-07-17T20:07:17.205Z'
updatedAt: '2026-07-21T15:30:19.629Z'
---

## Description

Implementation Order step 3 and the store-round-trip checkpoint. Extend the config-free markdown/OKF store, paths, authored parsing thread, public exports, stats, and fresh-store factory option. This task solely owns B-003, B-005, B-006, B-007, and B-008, including the real-store GREEN proof called out by the plan; do not duplicate their markers elsewhere. Work test-first and keep disk as truth on every episode-touching retrieval.

<!-- AC:BEGIN -->
- [x] #1 B-003 (Source AC-002) is GREEN with `@cosmo-behavior plan:episodic-log#B-003`: fresh project/user retrieval preserves the full episode envelope and qualified optional `source`, while architecture-map records remain compatible with source absent.
- [x] #2 B-005 (Sources AC-002 and AC-004) is GREEN with `@cosmo-behavior plan:episodic-log#B-005`: a fresh store reconstructs latest wake state from persisted qualified source, trigger subject, required stable payload, outcome, timestamp, path ordering, and attempt details without an in-memory default or second state file.
- [x] #3 B-006 (Sources AC-002 and AC-003) is proven with `@cosmo-behavior plan:episodic-log#B-006`: episodes are atomic, append-only direct-child files under `memory/agent/episodes/`, identical rendering is idempotent, non-identical occupants are preserved safely, and episode writes or later authored saves never create, rewrite, scan into, or list episodes in `index.md`.
- [x] #4 B-007 (Source AC-003) is proven with `@cosmo-behavior plan:episodic-log#B-007`: only queries whose `recordTypes` explicitly include `episode` walk and parse episode files; authored-only retrieval has no episode records, warnings, or scan cost, while malformed episode paths are named only on episode-touching retrieval.
- [x] #5 B-008 (Source AC-007) is proven with `@cosmo-behavior plan:episodic-log#B-008`: fresh direct and configured stores count valid and malformed episode reads in `filesScanned`/`bytesRead`, warn per physical scope only above the default or overridden threshold using the exact planned message, preserve overrides after restart, and never warn on authored-only retrieval.
- [x] #6 The store, OKF, paths, and record modules remain config/Pi/domain/lifecycle-free; every episode-touching turn performs a full disk rescan with no cache, registry, count map, latest-wake map, retention, pruning, delete API, or fabricated state.
- [x] #7 The only MemoryStore shape widening remains optional `RetrievedMemoryRecord.source`; file content hashing is used solely for filename uniqueness/deduplication, `writer:cosmonauts` remains provenance rather than integrity, and no SHA-256 safe-prune/edit verifier is added.
- [x] #8 (Closes the B-004 round-trip gap — Phase-6 review) The real-store GREEN proof for B-004's on-disk provenance lives here, not only in TASK-472's pure utility: a fresh `writeEpisode` → `retrieve(recordTypes: ["episode"])` round-trip exposes the `writer:cosmonauts` provenance tag on the machine-written episode, while a hand-written (human-authored) episode file retrieved from the same store lacks the tag. A `writeEpisode` that drops or mis-stamps `writer:cosmonauts` must fail this assertion (the tag is not merely computed by the pure utility but survives the real store write→read path that consolidation will filter on).
<!-- AC:END -->
