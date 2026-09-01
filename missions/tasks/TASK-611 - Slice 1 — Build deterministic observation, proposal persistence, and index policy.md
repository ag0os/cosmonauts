---
id: TASK-611
title: >-
  Slice 1 — Build deterministic observation, proposal persistence, and index
  policy
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory'
dependencies:
  - TASK-609
createdAt: '2026-09-01T20:08:28.366Z'
updatedAt: '2026-09-01T20:08:28.366Z'
---

## Description

Complete the Slice 1 read/proposal boundary. Implement `retire-when` parsing in `lib/memory/knowledge-records.ts`; deterministic citation resolution and observation in `lib/memory/living-memory.ts`; reusable proposal path safety plus non-removing durable machine writes in `lib/memory/proposal-files.ts`, `lib/memory/durable-files.ts`, `lib/memory/consolidation-proposals.ts`, and `lib/memory/consolidation-receipts.ts`; and the exact renderer-based policy in `lib/extensions/knowledge-surface/index-policy.ts`/`combined-context.ts`. This task owns B-008, B-009, and B-021. It establishes proposal/improve/accepted-receipt contracts needed by later slices but does not claim later-owned B-005/B-006/B-007/B-016/B-019. D-008 fixes attention pressure, D-011 keeps proposal kinds separate from knowledge types, D-017 defines the complete citation inventory, and D-024 limits executable `retire-when` checks to safe `path-exists|path-absent`. The extension depends on the core policy interface, never the reverse; no second path-safety writer or index renderer may remain.

Binding ratified ground — stop and escalate rather than adjust it: implementation and tests use temporary fixture copies only and never move, edit, or delete anything under this repository's live `knowledge/`; `knowledgeSurface` stays on; no live-corpus retirement round is run; no TTL, OM adoption/fork, scheduling/trigger execution, user-scope L4 mutation, embeddings, new OKF type, or explicit-save change enters scope. Edits, merges, and prescriptive output remain proposals only; `improve` can close only through a human conversion/rejection; hard deletion is solely a human `retiredRecords` ledger act. Ratified intent/ACs and human decisions D-001..D-004 are not worker-adjustable; any collision follows halt-and-escalate, while derived-plan collisions require amend-on-record before implementation.

<!-- AC:BEGIN -->
- [ ] #1 B-008 is green in `tests/memory/living-memory.test.ts` > `evaluates supported gotcha retire-when checks without adding a knowledge type`, with exact marker `@cosmo-behavior plan:living-memory#B-008`; optional/free-text conditions remain gotchas, only contained path-exists/path-absent checks can yield evidenced candidates, and unsafe paths or command-like predicates cannot authorize relocation.
- [ ] #2 B-009 is green in `tests/memory/living-memory.test.ts` > `turns stale citations into deterministic N=1 edits without a model call`, with exact marker `@cosmo-behavior plan:living-memory#B-009`; files metadata, links, and path-shaped backticks canonicalize safely, and stale references produce evidence-bound complete edit proposals without changing live knowledge.
- [ ] #3 B-021 is green in `tests/extensions/architecture-memory.test.ts` > `measures index pressure with the exact injection renderer and budget`, with exact marker `@cosmo-behavior plan:living-memory#B-021`; pressure uses the 50-row OR guaranteed-share-plus-one-row-headroom rule, preserves combined-context bytes, measures user records without mutating them, and reports `target-unmet` when safe project candidates are exhausted.
- [ ] #4 The healthy citation inventory covers exactly the ratified live knowledge/root/docs/active-plan/architecture sources and canonical forms; malformed, unreadable, escaping, or incomplete relevant discovery blocks all retirement while still allowing an evidenced report.
- [ ] #5 Reusable proposal/receipt persistence preserves existing containment, symlink refusal, exclusive identity, retry convergence, and file-plus-parent sync guarantees using temporary fixtures only; create/merge/retire/improve remain closed machine-proposal variants; `lib/memory/durable-files.ts` as shipped by this task exports no remove, unlink, or rename operation over source paths — source-removal-capable operations land first in TASK-612.
- [ ] #6 Project-native universal correctness evidence passes after every commit, and the Slice 0 B-001 receipt test and exact marker remain green at every commit.
<!-- AC:END -->
