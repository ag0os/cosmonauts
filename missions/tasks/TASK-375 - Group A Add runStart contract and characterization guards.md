---
id: TASK-375
title: 'Group A: Add runStart contract and characterization guards'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies: []
createdAt: '2026-06-05T21:57:02.391Z'
updatedAt: '2026-06-05T21:57:02.391Z'
---

## Description

Implementation Order T1 from plan orchestration-surface-consolidation.

Dependencies: none.
Behaviors: B-001, B-004 plus RED portions of B-002 and B-003.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-001, #B-004, and RED/characterization coverage for #B-002 and #B-003 near the executable tests.

Group A is the first merge gate; T1 and T2 must land before Groups B/C/D start.

<!-- AC:BEGIN -->
- [ ] #1 Add `lib/durable-runtime/run-start.ts` contract, explicit `RunStartState`/`RunStartInterruption`, and a discriminated `RunStartResult` union where interruptions do not extend or fake `RunGraphSchedulerResult`.
- [ ] #2 Add the store initialization-lock contract and `FileRunStore` implementation; `runStart` re-loads inside the lock and appends at most one `run_started`.
- [ ] #3 Add create/adopt/seed-once tests, including two process-local `FileRunStore` instances racing to start the same `RunRef`.
- [ ] #4 Add chain and Drive characterization tests that pass against current behavior before the refactor.
- [ ] #5 Add resume/rehydration tests proving persisted graph/step/result state is authoritative and partial/zero initial step records are repaired idempotently when the persisted graph matches.
- [ ] #6 Add graph-mismatch initialization diagnostic coverage proving `runStart` blocks/interrupts rather than overwriting a conflicting persisted graph.
- [ ] #7 Add safe-wrapper invariant test proving a scheduler store wrapper cannot change initialization locking or reads/reconciliation state.
<!-- AC:END -->
