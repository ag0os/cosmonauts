---
type: convention
title: Scheduler store wrappers may alter event writes only
description: >-
  A scheduler wrapper must share all correctness-critical reads and writes with
  the initialization store.
resource: >-
  knowledge/orchestration-surface-consolidation/convention-scheduler-store-wrappers-may-alter-event-writes-only-44853d9f23d4.md
tags:
  - dependency-boundary
  - orchestration
  - store
  - wrapper
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
When a frontend wraps a durable store to make event or diagnostic appends safer, every other operation must delegate to the same backing store, including initialization locking, run and graph reads, step reconciliation, attempts, scheduler state, and run/step writes. Allow only event and diagnostic append behavior to differ. Otherwise initialization and scheduling can observe different durable realities.
