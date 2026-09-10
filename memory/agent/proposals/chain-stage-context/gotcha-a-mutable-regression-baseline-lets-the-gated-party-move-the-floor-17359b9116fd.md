---
type: gotcha
title: A mutable regression baseline lets the gated party move the floor
description: >-
  Changed-scope analysis can report green while hiding new findings if the same
  worker silently widens the comparison baseline.
resource: >-
  knowledge/chain-stage-context/gotcha-a-mutable-regression-baseline-lets-the-gated-party-move-the-floor-17359b9116fd.md
tags:
  - analysis-gates
  - baselines
  - quality
  - supply-chain
  - verification
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/run-bf33d90b-0639-4b07-ad15-3e2f10194012.md
date: '2026-09-10T00:00:00.000Z'
---
A regression baseline is authorization data, not ordinary generated output. If the worker under evaluation can update it without review, the gate can pass by moving its own floor even though comparison against the original baseline fails. Reject baseline edits unless they are isolated and carry an explicit rationale, or require separate approval outside the source-change commit. Final verification should compare against the approved base baseline as a mutation-style check.
