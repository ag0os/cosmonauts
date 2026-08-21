---
type: decision
title: Remediation should rerun the capability request
description: >-
  Route the exact generic request and readable finding designations, then let
  the remediator obtain a fresh structured result as ground truth.
resource: >-
  knowledge/analysis-capabilities/decision-remediation-should-rerun-the-capability-request-0e4c153bf768.md
tags:
  - agent-boundaries
  - freshness
  - remediation
  - structured-results
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
When structured tool results cannot cross an agent boundary losslessly, do not depend on model-authored summaries or impose cross-session deterministic finding IDs. Route the exact capability request—kind, base, scope, and metric—plus human-readable designations such as location, category, and message. The remediator reruns that request before editing and uses the fresh complete result as ground truth; if a finding no longer reproduces or the rerun fails, return it for re-analysis rather than applying stale advice.
