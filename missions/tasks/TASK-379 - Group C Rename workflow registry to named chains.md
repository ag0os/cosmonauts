---
id: TASK-379
title: 'Group C: Rename workflow registry to named chains'
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-376
createdAt: '2026-06-05T21:57:35.806Z'
updatedAt: '2026-06-05T22:44:58.826Z'
---

## Description

Implementation Order T5 from plan orchestration-surface-consolidation.

Dependencies: T2.
Behaviors: B-011, B-015.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-011 and #B-015 near the executable tests.

Group C starts only after Group A is green.

<!-- AC:BEGIN -->
- [x] #1 Add `lib/chains/*` and `NamedChain`.
- [x] #2 Define `ProjectConfig.chains?: Record<string, { description?: string; chain: string }>`; project entries override domain entries by key/name.
- [x] #3 Update domain loader/runtime/config/validator to `chains` naming.
- [x] #4 Rename domain defaults to `chains.ts` and update tests.
- [x] #5 Registry accepts a project chain named `list` as normal data.
- [x] #6 No final `workflows` project-config alias or `RunRecord.kind` work is introduced.
<!-- AC:END -->
