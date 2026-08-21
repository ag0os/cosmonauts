---
type: gotcha
title: Parallel refactors must serialize shared-file ownership
description: >-
  Behaviorally independent tasks can still conflict when they modify different
  complex functions in the same source file.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/gotcha-parallel-refactors-must-serialize-shared-file-ownership-7cba54bfddd9.md
tags:
  - file-ownership
  - parallel-work
  - refactoring
  - task-dependencies
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
Do not infer parallel safety solely from function-level scope. If two tasks edit the same file, make their order explicit even when the functions are logically independent; the first refactor can change imports, helper placement, local types, and surrounding structure needed by the second. Parallelize only tasks with disjoint file ownership or a pre-agreed integration seam. Same-file serialization reduces merge conflict risk and prevents independently invented local architectures.
