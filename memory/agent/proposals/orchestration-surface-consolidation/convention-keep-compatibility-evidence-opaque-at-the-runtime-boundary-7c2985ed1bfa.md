---
type: convention
title: Keep compatibility evidence opaque at the runtime boundary
description: >-
  Generic runtime events may carry frontend compatibility evidence without
  importing frontend event types.
resource: >-
  knowledge/orchestration-surface-consolidation/convention-keep-compatibility-evidence-opaque-at-the-runtime-boundary-7c2985ed1bfa.md
tags:
  - compatibility
  - dependency-direction
  - events
  - runtime-boundary
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Use a generic opaque activity event for compatibility payloads, and let the owning frontend encode and reconstruct its legacy event shape at the edge. The generic runtime should summarize such activity generically and must not treat it as canonical lifecycle evidence. This preserves dependency direction and prevents compatibility traffic from changing terminal status.
