---
type: trade-off
title: Retain a scoped legacy fallback while normalized compatibility matures
description: >-
  A deprecated compatibility reader may temporarily fall back to dual-written
  legacy data when normalized projection is incomplete.
resource: >-
  knowledge/orchestration-surface-consolidation/trade-off-retain-a-scoped-legacy-fallback-while-normalized-compatibility-matures-2e4a802832e4.md
tags:
  - compatibility
  - events
  - fallback
  - migration
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Prefer normalized events on the healthy path, but while legacy data is still dual-written, verify projection completeness against an independent legacy count and a persisted degraded marker. If normalized compatibility evidence is missing or partial, fall back only in the deprecated compatibility reader and report the fallback source and divergence; keep canonical status and watch APIs normalized-only. This accepts temporary dual-write complexity to prevent silently truncated legacy responses.
