---
type: gotcha
title: A local correctness fix can invalidate distant caller assumptions
description: >-
  Making a helper more truthful can expose stale inference or error-handling
  assumptions at callers that were previously unreachable.
resource: >-
  knowledge/living-memory-fidelity/gotcha-a-local-correctness-fix-can-invalidate-distant-caller-assumptions-1033a9783e79.md
tags:
  - call-graphs
  - durability
  - regression-risk
  - review
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/living-memory-fidelity/review-17.md
date: '2026-09-09T00:00:00.000Z'
---
Whenever a helper changes when it reports mutation, errors, absence, or recovery, enumerate all callers and re-audit their success and failure logic. A locally correct change can create a new reachable state—for example, an idempotent helper newly reporting no mutation can make a distant caller's outcome-based commit inference false, while a newly surfaced commit can reopen later error paths. Review the semantic delta across the call graph, not just the changed helper and its direct tests.
