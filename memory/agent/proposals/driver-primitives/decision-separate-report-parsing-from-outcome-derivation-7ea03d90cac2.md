---
type: decision
title: Separate report parsing from outcome derivation
description: >-
  Parse agent output without execution context, then combine uncertain reports
  with independent verification.
resource: >-
  knowledge/driver-primitives/decision-separate-report-parsing-from-outcome-derivation-7ea03d90cac2.md
tags:
  - driver
  - parsing
  - reports
  - verification
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Keep report parsing pure: return a structured explicit outcome when recognizable and an unknown result with raw output otherwise. Derive the effective execution outcome later, where verification results are available: unknown plus all checks passing becomes success, while unknown plus any failed check becomes failure. Explicit report outcomes remain authoritative. This makes parser behavior deterministic and verification policy independently testable.
