---
type: convention
title: Abnormal scheduler drains carry structured causes
description: >-
  Schedulers distinguish clean completion from abnormal drain by emitting
  structured blocker or failure evidence before the terminal abort.
resource: >-
  knowledge/orchestration-hardening/convention-abnormal-scheduler-drains-carry-structured-causes-f3e58fc623bd.md
tags:
  - diagnostics
  - events
  - orchestration
  - scheduler
timestamp: '2026-06-24T17:42:28.658Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-403 - Emit a structured diagnostic reason when the
  Drive scheduler drains or aborts.md
date: '2026-06-24T17:42:28.658Z'
---
When scheduling stops with unfinished work, record a machine-readable cause rather than a generic drain message. Include the pending-work count and classify the cause, such as unmet dependencies with blocker identities, setup/backend failure, or an exception with its phase and work item. For exception paths, emit the diagnostic before the abort event so event consumers retain causal ordering; reserve completion for the all-work-done state.
