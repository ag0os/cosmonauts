---
type: trade-off
title: Bound event text while preserving cursor-based recovery
description: >-
  Cap model-visible event output to control context growth, but expose how
  callers can retrieve omitted history.
resource: >-
  knowledge/drive-smoke-fixes/trade-off-bound-event-text-while-preserving-cursor-based-recovery-68ae5aac0e38.md
tags:
  - context-budget
  - events
  - pagination
  - tool-output
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
Render only a bounded number of recent events and cap each summary's length so monitoring does not flood the context window. When older events are omitted, report the omitted count and a cursor that can be supplied to retrieve the preceding or subsequent page. Keep the complete payload in the structured response; the compact text is a usability view, not the canonical event store.
