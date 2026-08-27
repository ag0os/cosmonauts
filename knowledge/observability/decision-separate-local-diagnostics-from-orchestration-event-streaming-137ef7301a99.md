---
type: decision
title: Separate local diagnostics from orchestration event streaming
description: >-
  Use an in-session lifecycle extension for durable local diagnostics and an
  external subscriber for orchestration-facing progress and aggregation.
resource: >-
  knowledge/observability/decision-separate-local-diagnostics-from-orchestration-event-streaming-137ef7301a99.md
tags:
  - architecture
  - events
  - extensions
  - observability
  - ownership
timestamp: '2026-03-11T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/observability/plan.md
date: '2026-03-11T00:00:00.000Z'
---
Observability has two distinct ownership boundaries. An extension running inside orchestration-heavy sessions records structured diagnostic entries and handles shutdown flushing; the spawner's external subscriber translates selected events for chain progress and aggregate statistics. Keeping these paths separate avoids making local diagnostics depend on the chain runner and avoids exposing every low-level lifecycle event to orchestration consumers.
