---
id: TASK-376
title: 'Group A: Route durable chain and Drive through runStart'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-375
createdAt: '2026-06-05T21:57:13.540Z'
updatedAt: '2026-06-05T22:24:45.715Z'
---

## Description

Implementation Order T2 from plan orchestration-surface-consolidation.

Dependencies: T1.
Behaviors: B-001, B-002, B-003, B-004.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-001, #B-002, #B-003, and #B-004 near the executable tests.

Group A is the first merge gate; T1 and T2 must land before Groups B/C/D start.

<!-- AC:BEGIN -->
- [x] #1 `runDurableChain` delegates create/write/seed/scheduler loop to `runStart` and keeps chain behavior at the chain edge.
- [x] #2 `compileDriveRunToGraph` is split so `runDriveOnGraph` calls `runStart` with Drive graph/initial steps/create-run metadata.
- [x] #3 Drive finalizer polling and safe event writes remain Drive-edge layers.
- [x] #4 Drive resume/repair compiles the graph from persisted `metadata.driveTaskIds` via `withAuthoritativeTaskIds`, never a `remainingTaskIds` slice; a named test pins `driveTaskIds` vs `remainingTaskIds` across resume and partial-init repair.
- [x] #5 Durable chain and Drive graph tests remain green, including detached frozen-runner safety and partial-init repair.
<!-- AC:END -->
