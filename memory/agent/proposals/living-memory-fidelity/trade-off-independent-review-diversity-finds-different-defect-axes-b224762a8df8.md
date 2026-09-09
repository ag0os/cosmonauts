---
type: trade-off
title: Independent review diversity finds different defect axes
description: >-
  Independent reviewers with different framing can uncover defect dimensions
  that repeated in-process reviews miss, at the cost of additional review
  latency.
resource: >-
  knowledge/living-memory-fidelity/trade-off-independent-review-diversity-finds-different-defect-axes-b224762a8df8.md
tags:
  - defect-discovery
  - durability
  - independent-review
  - trade-offs
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/living-memory-fidelity.md
date: '2026-09-09T00:00:00.000Z'
---
Use an independently framed reviewer when a cross-cutting class has survived several remediation rounds or has been declared closed more than once. Supply the invariant and known axes, but require a fresh enumeration and an explicit search for the opposite defect. The added latency is justified for state-safety and durability reporting: repeated reviewers following the same framing tend to extend the existing axis, while different eyes can identify a new axis or reveal that tests cover producers but not consumers.
