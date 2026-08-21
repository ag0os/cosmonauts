---
type: decision
title: Long-running orchestration snapshots its tooling inputs
description: >-
  A run persists the resolved content of its own execution inputs at launch and
  reuses that snapshot for every task and resume.
resource: >-
  knowledge/orchestration-hardening/decision-long-running-orchestration-snapshots-its-tooling-inputs-4adca0881101.md
tags:
  - orchestration
  - resume
  - self-modifying
  - snapshot
timestamp: '2026-06-24T17:49:16.541Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-404 - Drive must pin its own tooling (prompt
  envelope, resolved config) at run start.md
date: '2026-06-24T17:49:16.541Z'
---
Long-running, self-modifying orchestration must not repeatedly resolve its prompt templates or equivalent tooling from the live workspace. Resolve inputs once at launch, persist their content in run state, and use that immutable snapshot for task execution and resume. Paths may remain accepted as launch-time configuration, but paths alone are not a stable execution contract because tasks can move or edit the referenced files mid-run.
