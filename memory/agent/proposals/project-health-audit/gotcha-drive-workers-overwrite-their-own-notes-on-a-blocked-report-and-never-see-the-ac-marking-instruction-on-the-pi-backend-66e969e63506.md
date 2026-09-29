---
type: gotcha
title: "Drive workers overwrite their own notes on a blocked report and never see the AC-marking instruction on the Pi backend"
description: "Twenty-five driver observations from 23 slices; the recurring six are the blocked-report path and the backend-specific prompt block."
resource: knowledge/project-health-audit/gotcha-drive-workers-overwrite-their-own-notes-on-a-blocked-report-and-never-see-the-ac-marking-instruction-on-the-pi-backend-66e969e63506.md
tags:
  - drive
  - driver
  - tooling
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/coordinator-status.md
date: '2026-09-29T00:00:00.000Z'
---
Across 23 Drive slices the same tooling defects recurred: the acceptance-criteria-marking prompt block is injected only for external backends, so the cosmonauts-subagent worker blocks on unchecked ACs; on task_blocked Drive replaces implementationNotes with the block reason; task_edit has replace-only notes; an outcome: blocked line parses as unknown; and postflight plus an in-run retry still fire after a blocked report. The full ranked list with suggested fixes is missions/reviews/improvements/project-health-audit.md; the raw observations are numbered 1-25 in the archived coordinator-status.md. None were fixed inside this plan because it owns no driver code.
