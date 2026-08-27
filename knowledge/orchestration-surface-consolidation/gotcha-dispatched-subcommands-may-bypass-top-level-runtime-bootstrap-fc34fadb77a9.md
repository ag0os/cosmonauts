---
type: gotcha
title: Dispatched subcommands may bypass top-level runtime bootstrap
description: >-
  A separately dispatched subcommand does not automatically inherit parsing and
  runtime setup from the top-level command path.
resource: >-
  knowledge/orchestration-surface-consolidation/gotcha-dispatched-subcommands-may-bypass-top-level-runtime-bootstrap-fc34fadb77a9.md
tags:
  - bootstrap
  - cli
  - configuration
  - subcommands
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Before adding a new subcommand entry point, trace whether dispatch occurs before the top-level parser and runtime bootstrap. If it does, extract a shared bootstrap that handles runtime flags, plugin/domain discovery, model and profile selection, and runtime creation, and call it from both paths. Parser registration alone can otherwise yield a command that works in defaults but silently ignores established options.
