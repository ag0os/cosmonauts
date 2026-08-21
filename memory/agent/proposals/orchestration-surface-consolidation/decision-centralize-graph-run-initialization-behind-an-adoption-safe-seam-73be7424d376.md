---
type: decision
title: Centralize graph-run initialization behind an adoption-safe seam
description: >-
  Graph-backed frontends should share one initialization and scheduling envelope
  that safely creates or adopts a durable run.
resource: >-
  knowledge/orchestration-surface-consolidation/decision-centralize-graph-run-initialization-behind-an-adoption-safe-seam-73be7424d376.md
tags:
  - concurrency
  - durable-runtime
  - initialization
  - orchestration
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Use a single runtime-level run-start seam for run creation/adoption, graph persistence, initial step seeding, the initial lifecycle event, and scheduler passes. Protect initialization with a per-run durable critical section and reload state inside that section; a non-exclusive create API or a load-then-create sequence is not sufficient when separate processes can start the same run reference. Frontends should retain only compiler-specific inputs and result mapping.
