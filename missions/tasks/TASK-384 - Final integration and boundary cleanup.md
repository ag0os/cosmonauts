---
id: TASK-384
title: Final integration and boundary cleanup
status: Done
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-375
  - TASK-376
  - TASK-377
  - TASK-378
  - TASK-379
  - TASK-380
  - TASK-381
  - TASK-382
  - TASK-383
createdAt: '2026-06-05T21:58:09.141Z'
updatedAt: '2026-06-05T23:15:55.579Z'
---

## Description

Implementation Order T10 from plan orchestration-surface-consolidation.

Dependencies: T1 through T9.
Behaviors: all, especially B-019.
Marker expectations: final integration verifies behavior-marker coverage for @cosmo-behavior plan:orchestration-surface-consolidation#B-001 through #B-019.

This is the final integration gate after Group E.

<!-- AC:BEGIN -->
- [x] #1 Full project correctness and boundary gates pass.
- [x] #2 Artifact conformance for this plan passes.
- [x] #3 No generic runtime import violates dependency direction.
- [x] #4 No `nested-run` backend, parent run fields, `RunRecord.kind`, `run spawn`, reserved Drive `chain` scope creation, new mutable-parallel execution path, new worktree isolation execution path, merge finalizer, approval-gate execution path, or fan-out cap tuning landed.
- [x] #5 Existing shipped vocabulary (`StepKind` `"approval"`, `WorktreeSpec`, `RunPolicy.maxParallelSteps`) is allowed to remain and is not treated as failure by absence tests.
- [x] #6 Remove any temporary aliases left from intermediate tasks.
<!-- AC:END -->
