---
id: TASK-451
title: Write Pi-First session memory audit
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:memory-interface'
dependencies: []
createdAt: '2026-07-08T13:52:59.064Z'
updatedAt: '2026-07-08T13:52:59.064Z'
---

## Description

Implementation Order step 1. This is the gate for the entire memory-interface plan: no downstream memory contracts, stores, adapters, or extensions should proceed until this audit is complete. Behavior ownership: B-001 only. The worker must audit Pi session JSONL, compaction, pi.appendEntry(), ctx.sessionManager, and session/fork/compact lifecycle hooks, then record the W1 session-scope recommendation in the plan-local artifact. If evidence contradicts the planned no-session-markdown-store decision, pause and request a plan revision before any session-scope store is built.

<!-- AC:BEGIN -->
- [ ] #1 B-001 audit artifact exists at missions/plans/memory-interface/pi-first-session-memory-audit.md with evidence for Pi session JSONL, compaction, pi.appendEntry(), ctx.sessionManager, and lifecycle hooks, plus the exact marker @cosmo-behavior plan:memory-interface#B-001 near the executable/evidence section named by the plan.
- [ ] #2 B-001 recommendation explicitly locks the W1 default to no session-scoped markdown store with session retained in the shared scope vocabulary and future retrieve() calls expected to report skippedScopes for session, or explicitly declares that the plan must be revised before implementation continues.
- [ ] #3 The audit artifact states that no session-scope store, scratchpad, pruning, decay, embedding, SQLite, or relevance-gate machinery is authorized by this task.
- [ ] #4 The task completion evidence includes a git-status/commit handoff note ensuring the missions/plans/... audit artifact is not lost to Drive's missions/** exclusion.
<!-- AC:END -->
