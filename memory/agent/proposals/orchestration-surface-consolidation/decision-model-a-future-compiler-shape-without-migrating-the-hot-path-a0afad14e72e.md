---
type: decision
title: Model a future compiler shape without migrating the hot path
description: >-
  A one-node graph compiler can document convergence while preserving
  established inline spawn semantics.
resource: >-
  knowledge/orchestration-surface-consolidation/decision-model-a-future-compiler-shape-without-migrating-the-hot-path-a0afad14e72e.md
tags:
  - compiler
  - orchestration
  - scope-control
  - spawn
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Introduce and test a compiler that maps a spawn request to one agent graph step, but do not route the existing non-blocking spawn path through durable run startup until nested-run lifecycle is explicitly designed. Preserve its current identifier, authorization, concurrency, and follow-up delivery semantics, and avoid adding parent-run fields or a public run command merely to make the model executable early.
