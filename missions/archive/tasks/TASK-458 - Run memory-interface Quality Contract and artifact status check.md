---
id: TASK-458
title: Run memory-interface Quality Contract and artifact status check
status: Done
priority: high
labels:
  - testing
  - devops
  - 'plan:memory-interface'
dependencies:
  - TASK-457
createdAt: '2026-07-08T13:54:17.696Z'
updatedAt: '2026-07-08T16:20:25.426Z'
---

## Description

Implementation Order step 7. Final integration/verification only. Behavior ownership: none; this checkpoint verifies but does not own B-001 through B-015 or any implementation constraint. It must catch gaps without becoming the place where missing behavior is implemented.

<!-- AC:BEGIN -->
- [x] #1 Project-native test, lint, and typecheck evidence passes; no test makes model calls; pre-existing architecture-map generation/store/viewer behavior and the architecture-memory extension suite remain covered without substantive rewrites except the single sanctioned absent-directory registration expectation delta for B-015.
- [x] #2 A fresh cosmonauts architecture generate --no-narrative run on this repo followed by index and shard retrieval through the retrofitted shared-interface path succeeds end-to-end, with generated-output diff expectations documented because memory/architecture/ is not currently generated/tracked in this working copy.
- [x] #3 Artifact conformance passes: every B-001 through B-015 referenced test or evidence file has the exact @cosmo-behavior plan:memory-interface#B-### marker near the executable proof, the Pi audit artifact is present, and the implementation task graph still has exactly one owning task for each behavior.
- [x] #4 Boundary conformance passes: lib/memory/* has no Pi/CLI/domain imports, architecture generation/store/viewer files are unchanged, architecture retrieval crosses the shared interface, remember/recall and architecture_map_read are factory-registered for allowlisting, and execution remains gated.
- [x] #5 Mutation evidence exists for realistic faults: lazy memory-tool or architecture_map_read registration missing from real allowlists, non-Cosmo call after Cosmo writes, cross-project project-note leak, user-store scope: project leak, malformed record throwing the session, architecture traversal or root . mishandled, stale disk edit cached, multibyte truncation exceeding budget, and non-idempotent index.md regeneration churn.
- [x] #6 Complexity and dead-code review finds the new memory core small and free of registry/plugin framework beyond the two W1 stores, unused memory backend/config surfaces, session-store scaffolds, future W2/W4 record/consolidation variants, embeddings/SQLite hooks, decay, or pruning.
- [x] #7 Final git status explicitly accounts for required missions/** and memory/** artifacts that Drive may exclude, including the Pi audit artifact and any generated/project memory files, either committed in final state or documented as intentionally absent.
<!-- AC:END -->
