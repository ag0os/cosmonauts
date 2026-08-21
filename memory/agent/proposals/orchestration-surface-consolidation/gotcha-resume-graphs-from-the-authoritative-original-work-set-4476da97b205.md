---
type: gotcha
title: Resume graphs from the authoritative original work set
description: >-
  Recompiling a resumed graph from remaining work can create a false topology
  mismatch.
resource: >-
  knowledge/orchestration-surface-consolidation/gotcha-resume-graphs-from-the-authoritative-original-work-set-4476da97b205.md
tags:
  - graph
  - metadata
  - orchestration
  - resume
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
When graph topology and finalizer dependencies were built from an original task set, persist that authoritative set and use it for every resume or partial-initialization repair. A remaining-work slice is suitable for queue display, not graph recompilation: using it can make a valid persisted graph appear incompatible and can lose ordering or finalizer dependencies.
