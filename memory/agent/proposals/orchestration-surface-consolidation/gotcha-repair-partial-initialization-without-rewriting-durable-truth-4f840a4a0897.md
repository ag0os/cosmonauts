---
type: gotcha
title: Repair partial initialization without rewriting durable truth
description: >-
  A resumed graph run may have a persisted graph but zero or partial step
  records after a crash.
resource: >-
  knowledge/orchestration-surface-consolidation/gotcha-repair-partial-initialization-without-rewriting-durable-truth-4f840a4a0897.md
tags:
  - crash-recovery
  - orchestration
  - resume
  - state-integrity
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
On adoption, treat a non-empty persisted graph and existing step records as authoritative. If the newly compiled topology matches, create pending records only for graph steps that have no record and preserve all existing results, attempts, heartbeats, metadata, and scheduler state. If topology differs, stop with an explicit initialization diagnostic rather than overwriting the graph; otherwise a recoverable crash can become silent state corruption or a scheduler block.
