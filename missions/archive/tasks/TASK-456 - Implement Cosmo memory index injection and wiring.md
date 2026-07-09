---
id: TASK-456
title: Implement Cosmo memory index injection and wiring
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-455
createdAt: '2026-07-08T13:53:56.387Z'
updatedAt: '2026-07-08T16:10:42.554Z'
---

## Description

Implementation Order step 5, second half. Finish Cosmo's later-session memory UX by injecting compact note indexes and wiring the extension/prompt after tool behavior is proven. Behavior ownership: B-006 and B-013 only.

<!-- AC:BEGIN -->
- [x] #1 B-006 before_agent_start for main/cosmo injects exactly one hidden agent-memory-context built from current disk project+user note records and instructing Cosmo to use recall(query) for detail; absent or empty stores inject nothing and create no files; tests carry @cosmo-behavior plan:memory-interface#B-006.
- [x] #2 The agent-memory context is non-accumulating on context, lists compact metadata only (title, scope, kind, timestamp, description, path), never includes all record bodies, and uses list-mode retrieval with an explicit cap of the 50 most recent records before byte-budget truncation.
- [x] #3 B-013 injected memory index obeys an independent 12,000 UTF-8 byte budget including header and truncation footer, never exceeds budget through split multi-byte characters, preserves scope/freshness honesty for included excerpts, and directs Cosmo to recall(query) for full detail; tests carry @cosmo-behavior plan:memory-interface#B-013.
- [x] #4 Cosmo wiring adds agent-memory only to domains/main/agents/cosmo.ts, not coding agents or Cody, and domains/main/prompts/cosmo.md gives concise guidance for explicit visible saves, project vs user scope, and stating what was saved and where.
- [x] #5 Factory-registered remember/recall remain execution-gated and quiet in external hosts with no promptSnippet, and tests for this task use temp user roots, no real home directory, and no model calls.
- [x] #6 Tests cover empty-store inertness, context de-duplication, index cap 50, UTF-8-safe multi-byte truncation, and the mutation target where truncation would exceed the 12,000-byte budget.
<!-- AC:END -->
