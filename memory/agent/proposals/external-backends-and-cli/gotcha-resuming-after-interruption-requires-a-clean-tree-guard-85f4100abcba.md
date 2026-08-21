---
type: gotcha
title: Resuming after interruption requires a clean-tree guard
description: >-
  A resumable run must refuse an ambiguous working tree unless the operator
  explicitly accepts the risk.
resource: >-
  knowledge/external-backends-and-cli/gotcha-resuming-after-interruption-requires-a-clean-tree-guard-85f4100abcba.md
tags:
  - git
  - interruption
  - resume
  - safety
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Derive the resume point from durable terminal task events, but check repository cleanliness before invoking more work. An interruption after a task starts but before its terminal event can leave uncommitted or partially applied changes whose ownership is unknown. Refuse a dirty tree by default, report the affected paths, and require an explicit override to continue; do not silently rerender or rerun already terminal tasks.
