---
type: decision
title: Keep shared CLI helpers below command business logic
description: >-
  Shared output and error helpers should provide low-level presentation
  primitives without owning persistence, command flow, or domain managers.
resource: >-
  knowledge/fallow-temp-exceptions-cleanup/decision-keep-shared-cli-helpers-below-command-business-logic-c9f0cf9c61ea.md
tags:
  - architecture
  - cli
  - dependency-direction
  - shared-helpers
timestamp: '2026-04-29T13:10:03.623Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/fallow-temp-exceptions-cleanup/plan.md
date: '2026-04-29T13:10:03.623Z'
---
When multiple commands duplicate output-mode selection, line printing, table rendering, or error formatting, centralize those primitives in a CLI-only shared layer. Keep command-specific parsing, mutation, prompting, and result rendering beside each command unless the same contract has at least three genuine consumers. Shared CLI helpers must not import command modules or domain managers, and library/domain modules must not depend on CLI helpers. This dependency direction prevents convenience utilities from becoming a second application layer.
