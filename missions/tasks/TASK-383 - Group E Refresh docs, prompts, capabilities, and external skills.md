---
id: TASK-383
title: 'Group E: Refresh docs, prompts, capabilities, and external skills'
status: To Do
priority: medium
labels:
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-377
  - TASK-378
  - TASK-379
  - TASK-380
  - TASK-381
  - TASK-382
createdAt: '2026-06-05T21:58:01.842Z'
updatedAt: '2026-06-05T21:58:01.842Z'
---

## Description

Implementation Order T9 from plan orchestration-surface-consolidation.

Dependencies: T3, T4, T5, T6, T7, T8.
Behaviors: B-018, B-019.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-018 and #B-019 near the executable tests.

Group E lands last after Groups B/C/D are complete.

<!-- AC:BEGIN -->
- [ ] #1 Update docs/README/driver README around `cosmonauts run`, named chains, run IDs, normalized observation, and compatibility.
- [ ] #2 Update Drive and spawning skills/capabilities.
- [ ] #3 Update external cosmonauts skill bundle; rename or rewrite workflow guidance to named chains.
- [ ] #4 Prompt/doc terminology tests pass; removed flags and old primary CLI names are absent from active guidance.
- [ ] #5 Absence checks target new deferred execution surfaces, not existing durable-runtime type vocabulary.
<!-- AC:END -->
