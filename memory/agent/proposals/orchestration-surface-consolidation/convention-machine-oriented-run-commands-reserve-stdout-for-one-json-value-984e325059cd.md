---
type: convention
title: Machine-oriented run commands reserve stdout for one JSON value
description: >-
  Run CLI output should separate machine results from human progress and
  diagnostics.
resource: >-
  knowledge/orchestration-surface-consolidation/convention-machine-oriented-run-commands-reserve-stdout-for-one-json-value-984e325059cd.md
tags:
  - cli
  - json
  - observability
  - stdout
timestamp: '2026-06-06T14:31:22.801Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/orchestration-surface-consolidation/plan.md
date: '2026-06-06T14:31:22.801Z'
---
Every run-oriented subcommand should emit exactly one JSON value on stdout, send progress, warnings, and diagnostics to stderr, and use exit status to distinguish successful terminal outcomes from failure. Do not add format switches to a surface that is JSON-native; stable stream separation makes commands composable for both humans and automation.
