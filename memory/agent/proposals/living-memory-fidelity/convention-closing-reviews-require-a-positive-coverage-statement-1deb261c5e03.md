---
type: convention
title: Closing reviews require a positive coverage statement
description: >-
  A no-findings verdict is insufficient unless it names the paths, axes, inverse
  cases, and boundaries actually checked.
resource: >-
  knowledge/living-memory-fidelity/convention-closing-reviews-require-a-positive-coverage-statement-1deb261c5e03.md
tags:
  - coverage
  - handoff
  - quality-gates
  - review
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/living-memory-fidelity/review-18.md
date: '2026-09-09T00:00:00.000Z'
---
A closing review must make absence falsifiable. Require the reviewer to state positively which defect axes, modules, callers, error paths, no-op paths, and inverse failure modes were inspected, and to provide an independent enumeration rather than repeat the remediation author's list. Record unbound gates as unbound. A bare pass or no-findings verdict is compatible with not having examined the load-bearing behavior and is not handoff evidence.
