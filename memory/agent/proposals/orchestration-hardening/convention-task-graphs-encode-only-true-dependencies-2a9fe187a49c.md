---
type: convention
title: Task graphs encode only true dependencies
description: >-
  A task depends on another only when it consumes that task's output, contract,
  file state, or runtime state.
resource: >-
  knowledge/orchestration-hardening/convention-task-graphs-encode-only-true-dependencies-2a9fe187a49c.md
tags:
  - dependencies
  - parallelism
  - planning
  - tasks
timestamp: '2026-06-24T18:00:45.813Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-411 - Task-manager encode minimal real
  dependencies so Drive can parallelize independent work.md
date: '2026-06-24T18:00:45.813Z'
---
Do not create a linear task chain by default. Add a dependency only when downstream work genuinely requires an upstream artifact, shared contract, shared file state, or runtime state; leave unrelated work unblocked so the scheduler can parallelize it. Dependency structure is an execution contract, so unnecessary edges directly increase delivery time and hide the intended concurrency of the plan.
