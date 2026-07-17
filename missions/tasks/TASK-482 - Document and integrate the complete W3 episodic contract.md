---
id: TASK-482
title: Document and integrate the complete W3 episodic contract
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log'
dependencies:
  - TASK-471
  - TASK-474
  - TASK-475
  - TASK-476
  - TASK-477
  - TASK-481
createdAt: '2026-07-17T20:08:55.057Z'
updatedAt: '2026-07-17T20:08:55.057Z'
---

## Description

Implementation Order step 9 docs and integration. Update `docs/memory.md` and exercise the complete enabled/disabled W3 contract in isolated project/user roots after all capture owners and detached reconciliation are available. This task solely owns B-029; it must not duplicate any other behavior marker.

<!-- AC:BEGIN -->
- [ ] #1 B-029 (Source AC-008) is proven with the sole `@cosmo-behavior plan:episodic-log#B-029` marker: `docs/memory.md` states the project-only OFF-by-default gate and threshold, file-per-episode layout/example, reserved tags, exact finite vocabulary, scope and actor rules, subject/payload conventions, warning channels, and no raw-session capture.
- [ ] #2 Documentation states that episodes are recall-only, never injected or indexed; disabled W2 remember/recall/injection remains byte-identical with zero new files, and the W2 explicit sequential-save/consent contract is untouched.
- [ ] #3 Documentation states append-forever, per-episode-touching full rescans with stats and no cache/retention/pruning/delete API, including the per-scope large-log warning and fresh-store threshold behavior.
- [ ] #4 Documentation presents `writer:cosmonauts` only as editable provenance, explicitly disclaims SHA-256 integrity/edit detection/safe-prune guarantees, and assigns the trust predicate to `memory-consolidation`.
- [ ] #5 Documentation explains fresh-process wake reconstruction from persisted source/subject/payload/outcome/timestamp and content-`completedAt`-derived Drive terminal identity, never mtime-derived, including the scoped fire-and-forget hard-kill residual.
- [ ] #6 Isolated integration evidence exercises every ratified vocabulary action, configured threshold, recall/injection byte comparison, deletion/malformed and human-edited episodes, fresh wake reconstruction, binding-aware detached actor, and fail-soft capture/reporting without leaving scratch memory or generated artifacts.
- [ ] #7 All 29 planned behaviors retain exactly one executable marker owner; this task adds no marker other than B-029 and introduces no host, consolidation, trust, session-store, user-config-loader, or pruning scope.
<!-- AC:END -->
