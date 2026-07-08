---
id: TASK-457
title: Document W1 memory and expose the public surface
status: To Do
priority: medium
labels:
  - backend
  - devops
  - testing
  - 'plan:memory-interface'
dependencies:
  - TASK-456
createdAt: '2026-07-08T13:54:05.972Z'
updatedAt: '2026-07-08T13:54:05.972Z'
---

## Description

Implementation Order step 6. Document the shipped W1 substrate and finish public exports/wiring tests. Behavior ownership: none; this task supports previously owned behaviors without becoming their owner.

<!-- AC:BEGIN -->
- [ ] #1 docs/memory.md documents the W1 store layout, plain-text OKF v0.1 type: note record shape, scope x kind taxonomy, project/user sibling stores, audit-gated session skipped behavior, index-inject plus pull recall model, recall default/cap 5/20, index build cap 50, independent 12,000-byte injection budget, and consolidate() no-op semantics.
- [ ] #2 docs/memory.md records W1 exclusions and trade-offs: no relevance gate, embeddings, SQLite, decay, pruning, session-scope store, registry/plugin framework, or future record types; per-turn full-store scans are accepted at W1 scale with a W2/reassess trigger before stores grow into hundreds of records.
- [ ] #3 docs/memory.md documents human ownership and operational gotchas: project memory under memory/ is git-tracked with no new ignore rule, user memory under ~/.cosmonauts/memory/agent/, architecture map remains under memory/architecture/, and Drive may exclude missions/** and memory/** artifacts so git status must be checked.
- [ ] #4 lib/memory/index.ts publicly exports the approved memory contracts and factories, fallow.toml treats lib/memory/index.ts as a public entry point, and no extra backend/config/session-store/consolidation variant is exposed.
- [ ] #5 tests/domains/main-domain.test.ts proves main/cosmo resolves the new agent-memory extension, real extension tool collection/buildToolAllowlist includes remember and recall, and adding the extension does not enable built-in read/write tools for Cosmo.
- [ ] #6 Documentation and public-surface changes preserve import direction: lib/memory remains domain-neutral, extensions stay at the Pi edge, generation/store/viewer files remain out of scope, and tests make no model calls or real-home writes.
<!-- AC:END -->
