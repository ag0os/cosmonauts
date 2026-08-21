---
type: trade-off
title: Live binding switches affect future resolutions only
description: >-
  Hot-swapping a role changes subsequent work without mutating or cancelling
  work already in flight.
resource: >-
  knowledge/domain-authoring/trade-off-live-binding-switches-affect-future-resolutions-only-453f418ffe4c.md
tags:
  - bindings
  - domains
  - execution-semantics
  - live-switching
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
When an operator changes a live role binding, apply it only to future agent, spawn, and chain resolutions. Already-running agents and child work retain the definitions, prompts, tools, models, and skills captured at start. This sacrifices immediate global replacement in exchange for deterministic in-flight execution and avoids unsafe prompt mutation or cancellation semantics.
