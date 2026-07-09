---
id: TASK-453
title: Implement the plain-text OKF markdown note store
status: Done
priority: high
labels:
  - backend
  - database
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-452
createdAt: '2026-07-08T13:53:21.277Z'
updatedAt: '2026-07-08T15:47:10.827Z'
---

## Description

Implementation Order step 3. Build the general-memory authored note substrate over plain markdown files. This task owns the store-level behaviors and the mechanics later used by remember/recall, but B-005 and B-007 remain owned by the agent-memory extension task in step 5. Behavior ownership: B-008, B-009, B-010, and B-014 only.

<!-- AC:BEGIN -->
- [x] #1 The markdown store writes and validates plain-text OKF v0.1 authored records with exactly type: note, OKF-required frontmatter, custom scope and kind fields, optional source, body content, project records under <projectRoot>/memory/agent/, user records under <userCosmonautsRoot>/memory/agent/, and the architecture map store untouched at memory/architecture/.
- [x] #2 B-008 scope filtering prevents cross-project leaks: project and user stores are resolved as sibling stores, physical-store scope must match frontmatter scope, mismatches are malformed warnings, session scope follows the audit result and under the planned W1 result appears only in skippedScopes with no session markdown store; tests carry @cosmo-behavior plan:memory-interface#B-008.
- [x] #3 B-009 retrieval, recall-support retrieval, and index building reconstruct truth from disk on each call so human edits/deletions are reflected on the next retrieval and no process-local cache decides freshness or content; tests carry @cosmo-behavior plan:memory-interface#B-009.
- [x] #4 B-010 absent, empty, no-match, malformed, and scope-mismatched stores return honest non-fatal results without read-time scaffolding, while warnings name bad files and healthy records still return; tests carry @cosmo-behavior plan:memory-interface#B-010.
- [x] #5 B-014 compact/list results are most-recent-first by OKF timestamp with path as deterministic tie-breaker, empty text is list mode, index.md is excluded as an authored record, and W1 applies no automatic decay or pruning; tests carry @cosmo-behavior plan:memory-interface#B-014.
- [x] #6 Write-side behavior is deterministic and safe: factory-bound roots reject mismatched projectRoot lookups, write failures produce the reachable failed result with path/reason and no partial record, and index.md regeneration is a byte-idempotent pure function of the current record set with no volatile generation timestamps or no-op rewrite churn.
- [x] #7 Tests use only temporary project/user roots, never the real home directory and never model calls, and include mutation-target coverage for cross-project leaks, user-store scope: project leaks, malformed records throwing the session, stale disk edits cached in memory, and non-idempotent index.md regeneration.
<!-- AC:END -->
