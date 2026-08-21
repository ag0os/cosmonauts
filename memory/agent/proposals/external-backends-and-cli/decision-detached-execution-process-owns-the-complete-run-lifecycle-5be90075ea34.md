---
type: decision
title: Detached execution process owns the complete run lifecycle
description: >-
  A detached worker should own the run loop, plan lock, final events, completion
  record, and cleanup for its entire lifetime.
resource: >-
  knowledge/external-backends-and-cli/decision-detached-execution-process-owns-the-complete-run-lifecycle-5be90075ea34.md
tags:
  - detached-execution
  - lifecycle
  - locking
  - run-loop
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Implement detached execution as one long-lived process per run, not as a launcher that invokes a separate process per task. The detached process must acquire the plan-level lock itself, execute the same complete run loop used by inline mode, emit run-level start and terminal events, write the final result before cleanup, and release the lock in a finalizer. A parent CLI that exits immediately must never own a lock whose validity is meant to represent the detached run.
