---
type: trade-off
title: 'Treat partial work as committed progress, not completion'
description: >-
  Preserve verified partial work while keeping the task visibly unfinished and
  stopping by default.
resource: >-
  knowledge/driver-primitives/trade-off-treat-partial-work-as-committed-progress-not-completion-f995e96b8a64.md
tags:
  - commits
  - driver
  - partial-outcome
  - task-state
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
When an agent reports a partial outcome and verification passes, retain and commit the useful changes, keep the task in an in-progress state with structured progress notes, and emit a blocked-style progress event. Stop the run by default unless the caller explicitly chooses to continue. This avoids discarding valid work, at the cost of a task having a commit without being complete.
