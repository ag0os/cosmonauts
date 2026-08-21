---
type: decision
title: Keep frontend interruptions distinct from scheduler exits
description: >-
  Frontend stop-policy outcomes should not be fabricated as scheduler exit
  reasons.
resource: >-
  knowledge/orchestration-surface-consolidation/decision-keep-frontend-interruptions-distinct-from-scheduler-exits-32fc84a6ff18.md
tags:
  - api-contract
  - orchestration
  - state-machine
  - typing
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Represent run-start completion as a discriminated union with separate scheduler and interrupted branches. The scheduler branch preserves the scheduler's own exit-reason contract; the interrupted branch carries frontend stop-policy details, current run and step state, and diagnostics. This prevents frontend concerns from widening or misrepresenting the scheduler state machine.
