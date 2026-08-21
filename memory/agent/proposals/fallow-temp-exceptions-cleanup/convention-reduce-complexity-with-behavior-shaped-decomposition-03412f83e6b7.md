---
type: convention
title: Reduce complexity with behavior-shaped decomposition
description: >-
  Split complex functions along their actual behavioral dimensions rather than
  merely relocating branches into generic wrappers.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/convention-reduce-complexity-with-behavior-shaped-decomposition-03412f83e6b7.md
tags:
  - complexity
  - module-design
  - refactoring
  - separation-of-concerns
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
Choose a decomposition pattern that matches the source of complexity: phase helpers for lifecycle flows, strategy helpers for priority cascades, rule helpers for validation, predicate composition for filters, section renderers for reports, and per-variant formatter dispatch for closed event families. Keep orchestration wrappers short and preserve their public contracts. Plain extraction is a fallback only when no stronger behavioral boundary exists; moving the same branching wholesale into an unrelated helper does not meaningfully reduce complexity.
