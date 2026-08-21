---
type: decision
title: Keep in-flight work visible until archival completes
description: >-
  Move an item to Now when planning starts, but remove it only after the plan is
  archived and its durable knowledge is distilled.
resource: >-
  knowledge/roadmap-system/decision-keep-in-flight-work-visible-until-archival-completes-61e9a76e97ed.md
tags:
  - archive
  - lifecycle
  - memory
  - roadmap
timestamp: '2026-03-05T20:40:06.400Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/roadmap-system/plan.md
date: '2026-03-05T20:40:06.400Z'
---
Treat plan creation as the start of work, not completion of roadmap tracking. When work is picked up, move the item from Next to Now and link its plan. Keep it there throughout implementation. Remove it only after the plan has been archived and the resulting durable knowledge has been distilled. This makes Now a reliable inventory of in-flight work and prevents work from disappearing at the moment planning begins.
