---
id: TASK-585
title: Checkpoint B1 crash safety and no-write mutations in temporary roots
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-584
createdAt: '2026-08-25T23:04:38.255Z'
updatedAt: '2026-08-25T23:04:38.255Z'
---

## Description

Implementation Order Checkpoint B1; dependency barrier with no B-### ownership. Verify step-4 state/render/conflict work and B-007 transactions entirely in temporary roots before CLI integration. This checkpoint detects gaps but does not own D-002/D-006/D-007/D-008/D-009/D-013..D-016/D-019 or the behavior constraints assigned to implementing tasks. It may not write any live project/personal target or command.

<!-- AC:BEGIN -->
- [ ] #1 The selection/state, rendering, provenance, conflict, and transaction test surfaces pass together in temporary roots.
- [ ] #2 Mutation-style cases prove incomplete discovery, partial selection, edited/foreign/untraceable targets, invalid shapes, and command link requests write nothing.
- [ ] #3 Fresh-process evidence covers every phase-table row, journal-before-stage ordering, post-commit cleanup policies, exact partial rollback vectors, and evidence-held retries.
- [ ] #4 Check remains read-only and double-read, lock acquisition remains single and bounded, aliased scopes share canonical identity, and unconfirmed release stops later work.
- [ ] #5 No live owner root, migration evidence artifact, native command source, personal bundle, or live Claude command changes during this checkpoint.
<!-- AC:END -->
