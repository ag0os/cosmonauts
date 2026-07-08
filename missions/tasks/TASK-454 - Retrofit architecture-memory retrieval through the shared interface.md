---
id: TASK-454
title: Retrofit architecture-memory retrieval through the shared interface
status: Done
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-453
createdAt: '2026-07-08T13:53:35.043Z'
updatedAt: '2026-07-08T15:56:34.765Z'
---

## Description

Implementation Order step 4. This task completes B-002 after the markdown store exists, and owns the architecture-map retrofit behaviors. It must preserve the shipped architecture map retrieval UX while fixing the real-session allowlist defect found in review. Behavior ownership: B-002, B-003, B-004, and B-015 only.

<!-- AC:BEGIN -->
- [x] #1 B-002 shared-interface contract tests instantiate the real markdown memory store and the real architecture-map adapter through the same MemoryStore interface; markdown exercises real note write/retrieve, architecture exercises real map retrieval, project-ineligible retrieval returns empty scope-ineligible details, and architecture write returns unsupported; tests carry @cosmo-behavior plan:memory-interface#B-002 in tests/memory/interface.test.ts.
- [x] #2 B-003 architecture index injection delegates all reads through an injectable createStore MemoryStore spy, injects no context when memory/architecture/ is absent while architecture_map_read returns an honest missing-map result, and preserves compact index injection, freshness banner, non-accumulating custom messages, and tool-use instructions when mapped; tests carry @cosmo-behavior plan:memory-interface#B-003.
- [x] #3 B-004 architecture_map_read preserves pre-retrofit shard behavior through the adapter: default index read, module resource read, deprecated resource alias, module: "." to modules/root.md, unknown-module available-resource listing from shard frontmatter, malformed unrelated shard tolerance, and traversal/absolute-path rejection; tests carry @cosmo-behavior plan:memory-interface#B-004.
- [x] #4 B-015 architecture_map_read is registered at extension factory load so buildToolAllowlist for the five architecture-consuming agents includes it, mapped-project behavior is unchanged, and unmapped projects return the honest missing-map result instead of unregistered; tests carry @cosmo-behavior plan:memory-interface#B-015 in tests/domains/coding-agents.test.ts.
- [x] #5 The adapter exposes typed architecture retrieval details and injected/default deps for loadConfig, analyzer, and checkFreshness, preserving checkArchitectureMapStatFreshness as the default freshness path and existing stale/missing/current rendering details.
- [x] #6 Boundary conformance holds: lib/architecture-map/generator.ts, lib/architecture-map/store.ts, CLI generation paths, lib/artifact-viewer/*, and memory/architecture/* generated output are unchanged; lib/architecture-map/retrieval.ts depends inward on lib/memory contracts and existing config/freshness helpers; lib/memory has no back-imports.
- [x] #7 Correctness and mutation coverage preserve the pre-existing architecture-memory suite without substantive rewrites except the sole sanctioned absent-directory registration delta, and negative tests catch lazy architecture_map_read registration, traversal/root-resource mishandling, and any parallel extension retrieval path that bypasses the spy store; tests make no model calls.
<!-- AC:END -->
