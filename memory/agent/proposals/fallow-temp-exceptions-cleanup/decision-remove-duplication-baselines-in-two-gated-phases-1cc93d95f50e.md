---
type: decision
title: Remove duplication baselines in two gated phases
description: >-
  First clean the residual post-refactor clone set while the baseline remains
  configured, then remove the baseline only after an unbaselined check is clean.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/decision-remove-duplication-baselines-in-two-gated-phases-1cc93d95f50e.md
tags:
  - baseline
  - duplication
  - migration
  - static-analysis
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
A duplication baseline that spans many subsystems should not be deleted before the refactors expected to reshape its clone families. Gate cleanup on all prerequisite refactors, audit the resulting tree, and eliminate only the residual clones using the smallest appropriate local helper, test builder, parameterized case, or inline collapse. Keep the baseline configured during this residual-cleanup phase. In a separate final step, delete the baseline and its configuration, then run the analyzer without it plus the complete test, lint, and type-check gates.
