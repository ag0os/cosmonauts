---
type: gotcha
title: A successful commit and task-state update are not atomic
description: >-
  If status persistence fails after commit, preserve the commit and record the
  inconsistent boundary explicitly.
resource: >-
  knowledge/driver-primitives/gotcha-a-successful-commit-and-task-state-update-are-not-atomic-2e859524b84b.md
tags:
  - driver
  - failure-recovery
  - git
  - task-state
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Repository history and task metadata are separate state systems, so a commit can succeed before the task update fails. Do not roll back or hide the commit. Emit the commit event first, abort the run with a status-update failure reason, and omit the task-completed event. Recovery can then reconcile the durable commit with the still-stale task state from an unambiguous audit trail.
