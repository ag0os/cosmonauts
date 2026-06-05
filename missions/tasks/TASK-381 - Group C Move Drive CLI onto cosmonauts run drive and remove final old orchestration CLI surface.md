---
id: TASK-381
title: >-
  Group C: Move Drive CLI onto cosmonauts run drive and remove final old
  orchestration CLI surface
status: To Do
priority: medium
labels:
  - backend
  - api
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-376
  - TASK-380
createdAt: '2026-06-05T21:57:50.171Z'
updatedAt: '2026-06-05T21:57:50.171Z'
---

## Description

Implementation Order T7 from plan orchestration-surface-consolidation.

Dependencies: T2, T6.
Behaviors: B-012, B-014.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-012 and #B-014 near the executable tests.

Group C starts only after Group A is green.

<!-- AC:BEGIN -->
- [ ] #1 Extract/move current Drive CLI helpers so `run drive` uses the same spec, resume, dirty-worktree, pending-finalization, inline/detached, and backend behavior.
- [ ] #2 `run drive` output matches current Drive JSON plus `scope`.
- [ ] #3 `run drive --plan chain` is rejected before durable run creation.
- [ ] #4 Final parser rejects `run spawn`; `-p/--print` still works.
- [ ] #5 Final parser/tests/docs no longer rely on `-w/--workflow`, `--list-workflows`, or bare `cosmonauts drive`.
<!-- AC:END -->
