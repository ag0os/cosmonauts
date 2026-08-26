---
type: gotcha
title: Durable commit intent must govern in-process exceptions too
description: >-
  Crash recovery can converge forward while the same durable commit is
  incorrectly rolled back by an exception handler in the originating process.
resource: >-
  knowledge/harness-adapters/gotcha-durable-commit-intent-must-govern-in-process-exceptions-too-37eaaeefaf63.md
tags:
  - commit
  - exceptions
  - harness-adapters
  - transactions
timestamp: '2026-08-26T18:35:52.960Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/harness-adapters/review-3.md
date: '2026-08-26T18:35:52.960Z'
---
Once a transaction durably records commit intent, every control path—including catch blocks still running in the original process—must obey that forward-only decision. Separate pre-commit failures, which may roll back, from post-intent failures, which must preserve or complete the committed state and report cleanup or evidence work still pending. Test both process exceptions and fresh-process recovery at the same phase boundary; testing crashes alone misses contradictory semantics.
