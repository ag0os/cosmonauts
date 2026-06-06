---
id: TASK-377
title: >-
  Group B: Surface run metadata and normalized observation for graph-backed
  agent tools
status: Done
priority: medium
labels:
  - backend
  - api
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-376
createdAt: '2026-06-05T21:57:20.351Z'
updatedAt: '2026-06-05T22:31:24.594Z'
---

## Description

Implementation Order T3 from plan orchestration-surface-consolidation.

Dependencies: T2.
Behaviors: B-005, B-006, B-007.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-005, #B-006, and #B-007 near the executable tests.

Group B starts only after Group A is green.

<!-- AC:BEGIN -->
- [x] #1 Add `ChainResult.run?: { runId; scope: "chain" }`; `runDurableChain` populates it, `runChain` leaves it undefined; a test pins both the durable and inline result shapes.
- [x] #2 `chain_run` details include `{ runId, scope: "chain" }` (from `result.run`) for graph-backed chains.
- [x] #3 `run_driver` response includes `scope: planSlug` while keeping `planSlug`.
- [x] #4 `run_driver` rejects reserved `planSlug === "chain"` before lock acquisition or durable run creation.
- [x] #5 Inline loop/completion chains remain legacy and explicitly non-durable.
- [x] #6 `run_status`/`run_watch` observe returned chain and Drive run IDs without frontend-specific branches.
<!-- AC:END -->
