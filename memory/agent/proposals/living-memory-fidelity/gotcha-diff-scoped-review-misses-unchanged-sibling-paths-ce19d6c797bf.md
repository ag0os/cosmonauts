---
type: gotcha
title: Diff-scoped review misses unchanged sibling paths
description: >-
  Reviewing only a remediation diff can repeatedly miss the same defect in a
  near-duplicate control path that the patch did not touch.
resource: >-
  knowledge/living-memory-fidelity/gotcha-diff-scoped-review-misses-unchanged-sibling-paths-ce19d6c797bf.md
tags:
  - control-flow
  - duplication
  - path-parity
  - review
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/living-memory-fidelity.md
date: '2026-09-09T00:00:00.000Z'
---
When a module contains sibling control flows, review must ask for path parity explicitly rather than follow only changed lines. Enumerate each required behavior across every continuation and compare gating, diagnostics, accumulated state, and lifecycle transitions. A narrow fix can be correct in one path while an unchanged fast path retains the original defect; repeated fresh reviews do not remove this blind spot unless the review question names the sibling path.
