---
type: convention
title: Blocked-input reports include the command and observed output
description: >-
  A worker claiming a required input is unavailable must provide the exact probe
  and its result.
resource: >-
  knowledge/drive-smoke-fixes/convention-blocked-input-reports-include-the-command-and-observed-output-1b59099646e2.md
tags:
  - blocked-task
  - diagnostics
  - evidence
  - failure-protocol
timestamp: '2026-05-12T20:55:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/drive-smoke-fixes/plan.md
date: '2026-05-12T20:55:00.000Z'
---
Define failure-reporting contracts so a missing-input block quotes the actual command or filesystem operation used to check the input and the resulting output or error. This evidence lets the orchestrator and reviewers distinguish a genuine missing dependency from an incorrect working directory, a version-control visibility mistake, or an unsupported assumption.
