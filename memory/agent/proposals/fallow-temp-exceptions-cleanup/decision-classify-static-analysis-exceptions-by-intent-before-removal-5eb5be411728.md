---
type: decision
title: Classify static-analysis exceptions by intent before removal
description: >-
  Temporary migration suppressions should be eliminated, while exceptions that
  encode deliberate public or framework contracts should remain documented and
  untouched.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/decision-classify-static-analysis-exceptions-by-intent-before-removal-5eb5be411728.md
tags:
  - configuration
  - contracts
  - static-analysis
  - technical-debt
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
Do not treat every static-analysis exception as equivalent debt. Classify each exception by intent: temporary suppressions that hide refactorable complexity or duplication belong in a removal plan, while exceptions required by a public API shape, dynamic loading convention, or other stable contract may remain. Record the reason for every retained exception so later cleanup does not accidentally break the contract in pursuit of a zero-exception metric.
