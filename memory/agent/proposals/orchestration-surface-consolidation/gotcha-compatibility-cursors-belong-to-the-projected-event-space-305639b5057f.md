---
type: gotcha
title: Compatibility cursors belong to the projected event space
description: >-
  A legacy event cursor cannot safely be interpreted as a normalized event
  sequence.
resource: >-
  knowledge/orchestration-surface-consolidation/gotcha-compatibility-cursors-belong-to-the-projected-event-space-305639b5057f.md
tags:
  - compatibility
  - cursor
  - events
  - pagination
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
For a compatibility view reconstructed from normalized events, apply `since` after reconstructing the legacy sequence and return the total projected legacy-event count as the next cursor. One legacy event may correspond to zero, one, or multiple canonical normalized events, so filtering by normalized sequence changes pagination semantics and can skip or duplicate legacy-visible events.
