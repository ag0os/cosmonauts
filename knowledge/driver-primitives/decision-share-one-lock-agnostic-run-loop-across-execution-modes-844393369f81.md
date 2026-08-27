---
type: decision
title: Share one lock-agnostic run loop across execution modes
description: >-
  Put run-level sequencing and events in an exported loop while mode wrappers
  own lifecycle resources.
resource: >-
  knowledge/driver-primitives/decision-share-one-lock-agnostic-run-loop-across-execution-modes-844393369f81.md
tags:
  - architecture
  - driver
  - execution-modes
  - run-loop
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Define one exported run-loop function that owns task ordering, run-level events, partial-outcome policy, and result derivation, but does not acquire the process-lifecycle lock. Inline and detached wrappers should each acquire the lock appropriate to their process, call the same loop, and release the lock in a finalizer. This prevents behavioral drift while ensuring the process that actually runs the loop owns the lock.
