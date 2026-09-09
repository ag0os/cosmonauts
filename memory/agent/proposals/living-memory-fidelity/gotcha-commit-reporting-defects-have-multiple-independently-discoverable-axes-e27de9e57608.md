---
type: gotcha
title: Commit-reporting defects have multiple independently discoverable axes
description: >-
  A durable-write fidelity class can remain open after error propagation and
  no-op inference are fixed because confirmation paths may still discard real
  commit facts.
resource: >-
  knowledge/living-memory-fidelity/gotcha-commit-reporting-defects-have-multiple-independently-discoverable-axes-e27de9e57608.md
tags:
  - commit-reporting
  - durability
  - error-paths
  - idempotency
  - review
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/living-memory-fidelity/review-17.md
date: '2026-09-09T00:00:00.000Z'
---
Audit commit reporting along at least three independent axes: (A) a mutation commits and a later error path loses the fact; (B) a success path invents commitment from a status, count, domain outcome, or successful return; and (C) a durability-confirmation operation receives a real commit fact but discards it. Do not declare the class closed after checking only known axes. A fix on one axis can make another axis newly reachable—for example, returning a primitive-owned mutation fact makes it possible to discover that a confirmation caller discards that fact, and that new commit source then requires its own post-commit error-path audit.
