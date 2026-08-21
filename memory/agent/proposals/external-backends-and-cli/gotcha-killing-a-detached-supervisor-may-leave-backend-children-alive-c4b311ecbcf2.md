---
type: gotcha
title: Killing a detached supervisor may leave backend children alive
description: >-
  Terminating the run process does not automatically guarantee termination of
  child CLI processes.
resource: >-
  knowledge/external-backends-and-cli/gotcha-killing-a-detached-supervisor-may-leave-backend-children-alive-c4b311ecbcf2.md
tags:
  - cleanup
  - detached-execution
  - process-management
  - signals
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
A detached supervisor that spawns external backends must not assume that killing the supervisor also kills its children. Without process-group ownership or explicit child tracking, an in-flight backend may continue after the run is reported dead, consuming resources or mutating the repository. Treat process-tree termination as an explicit lifecycle requirement or clearly document the weaker behavior.
