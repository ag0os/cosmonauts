---
type: decision
title: Guard the irreversible consumer at its execution boundary
description: >-
  Task decomposition is authorized only by matching addressed evidence from a
  strictly earlier topology position and a fresh artifact assessment.
resource: >-
  knowledge/chain-stage-context/decision-guard-the-irreversible-consumer-at-its-execution-boundary-f43a78f677ad.md
tags:
  - fail-closed
  - freshness
  - orchestration
  - review-gate
  - task-decomposition
timestamp: '2026-09-10T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/chain-stage-context/plan.md
date: '2026-09-10T00:00:00.000Z'
---
Enforce review completion immediately before the guarded consumer starts, rather than relying only on a reviser's self-check or cached state. Require addressed evidence for the bound plan and round from a strictly lower topology index, then re-read authoritative artifacts to ensure no newer assessable review round has appeared. Missing, same-index, malformed, stale, or mismatched evidence must block before any task-manager spawn and make the stage and chain visibly unsuccessful. This protects custom chains without a reviser and closes the interval between revision and decomposition.
