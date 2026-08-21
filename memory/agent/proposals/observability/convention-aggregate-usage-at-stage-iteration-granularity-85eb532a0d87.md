---
type: convention
title: Aggregate usage at stage-iteration granularity
description: >-
  Represent chain usage as per-stage-iteration records plus derived chain totals
  rather than as one undifferentiated counter.
resource: >-
  knowledge/observability/convention-aggregate-usage-at-stage-iteration-granularity-85eb532a0d87.md
tags:
  - chains
  - cost
  - metrics
  - observability
  - usage
timestamp: '2026-03-11T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/observability/plan.md
date: '2026-03-11T00:00:00.000Z'
---
Each spawned stage iteration should produce one usage record carrying the stage identity, iteration, agent identity, token categories, monetary cost, elapsed time, and turn count. Chain-level totals are derived by accumulating these records, and both stage and final totals are emitted as lifecycle events. This granularity makes retries and coordinator loops visible instead of hiding their cost inside a single chain total.
