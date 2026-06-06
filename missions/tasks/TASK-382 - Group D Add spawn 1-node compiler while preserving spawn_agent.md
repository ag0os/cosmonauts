---
id: TASK-382
title: 'Group D: Add spawn 1-node compiler while preserving spawn_agent'
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-376
createdAt: '2026-06-05T21:57:55.548Z'
updatedAt: '2026-06-05T23:05:40.508Z'
---

## Description

Implementation Order T8 from plan orchestration-surface-consolidation.

Dependencies: T2.
Behaviors: B-016, B-017, B-019.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-016, #B-017, and #B-019 near the executable tests.

Group D starts only after Group A is green.

<!-- AC:BEGIN -->
- [x] #1 Add `compileSpawnToGraph` returning one `agent` step on `cosmonauts-subagent` with spawn inputs in backend options.
- [x] #2 Tests prove no `nested-run` backend, no parent run fields, and no durable run record creation in current `spawn_agent` path.
- [x] #3 `spawn_agent` remains `spawnId` + follow-up message.
- [x] #4 No CLI `run spawn` exists.
<!-- AC:END -->
