---
type: gotcha
title: "The Quality Manager panel budget is read from the base revision and defaults to five minutes per lens"
description: "qualityReview.panelTimeoutMs bounds each reviewer lens spawn and comes from main's config, so a feature branch cannot raise it; a 177-file diff timed out once and needed 640-868 s of assessing on rerun."
resource: knowledge/project-health-audit/gotcha-the-quality-manager-panel-budget-is-read-from-the-base-revision-and-defaults-to-five-minutes-per-lens-64dc5246506e.md
tags:
  - config
  - quality-manager
  - timeouts
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
QM run 1 on this branch failed with "Panel completion timed out after 300000ms" while the coding/reviewer lens was still reading after 147 tool calls; the other three lenses had sealed clean. The budget is the base revision's qualityReview.panelTimeoutMs (default 300 000 ms) passed as the reviewer spawn timeout, and the whole assessing phase is separately bounded by assessmentTimeoutMs (default 900 000 ms, which run 3 came within 32 s of). The round-10 ruling set panelTimeoutMs to 1 200 000 and assessmentTimeoutMs to 1 800 000 on main and made check:reachability a configured review-base check. When a QM run fails this way, rerun once before treating it as non-converging; the second run completed.
