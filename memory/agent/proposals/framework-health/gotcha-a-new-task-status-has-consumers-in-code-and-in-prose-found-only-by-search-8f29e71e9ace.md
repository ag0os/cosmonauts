---
type: gotcha
title: 'A new task status has consumers in code and in prose, found only by search'
description: >-
  Adding the Cancelled terminal status took a status-literal search over
  production code and shipped guidance; the parser silently mapped unknown
  values to To Do.
resource: >-
  knowledge/framework-health/gotcha-a-new-task-status-has-consumers-in-code-and-in-prose-found-only-by-search-8f29e71e9ace.md
tags:
  - drive
  - scheduling
  - task-status
  - tasks
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: >-
  missions/archive/tasks/TASK-710 - Stage 3 a Cancelled task status, and the
  superseded audit plan archived.md
date: '2026-09-23T00:00:00.000Z'
---
`Cancelled` is a terminal task status: archive accepts it alongside `Done`, and selection excludes it as it excludes `Done`. Unlike `Done`, a Cancelled dependency is never satisfied, because the work will not happen, so dependents stay blocked. Superseded tasks are cancelled rather than marked Done, so their status does not contradict their own unchecked criteria. The trap was the consumers. The persisted-task parser mapped any unknown status to `To Do`, so a Cancelled task round-tripped silently as open. Drive completion, resume finalization, coordinator exit conditions, archived-dependency resolution (which had assumed Done) and several shipped skills and prompts saying "all Done" each needed changing. The list is found by searching for the status literals in code and authored prose, not remembered. Also check dependency timing: a later remediation replaced the per-step Cancelled check with a snapshot taken at run start, and a task cancelled mid-run then still ran its dependents. Check dependency status at each step start.
