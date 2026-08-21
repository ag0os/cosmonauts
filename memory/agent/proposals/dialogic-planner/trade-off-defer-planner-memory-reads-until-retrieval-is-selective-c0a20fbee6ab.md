---
type: trade-off
title: Defer planner memory reads until retrieval is selective
description: >-
  Avoid injecting an ever-growing raw memory log into planning context; wait for
  retrieval infrastructure that can select relevant records.
resource: >-
  knowledge/dialogic-planner/trade-off-defer-planner-memory-reads-until-retrieval-is-selective-c0a20fbee6ab.md
tags:
  - context-budget
  - memory
  - planning
  - retrieval
timestamp: '2026-06-06T14:31:23.038Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/dialogic-planner/plan.md
date: '2026-06-06T14:31:23.038Z'
---
Persistent memory can improve planning, but reading an append-only or continuously growing memory corpus directly into every planner invocation creates unbounded context cost and declining relevance. Accept the temporary loss of memory-assisted planning until selective retrieval is available. When adding the read path, retrieve only records relevant to the current design question rather than loading the whole store.
