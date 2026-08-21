---
type: decision
title: Keep execution specifications serializable
description: >-
  Represent a run with data only and inject live backend dependencies at the
  execution boundary.
resource: >-
  knowledge/driver-primitives/decision-keep-execution-specifications-serializable-9943a3fe1f66.md
tags:
  - dependency-injection
  - driver
  - runtime
  - serialization
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
A durable execution specification should contain only serializable identity, paths, ordered work, policy, verification, and backend-selection data. Do not embed backend instances, open resources, callbacks, or other process-local objects. Construct those dependencies at the mode-specific boundary so the same specification can be persisted, inspected, and executed by inline or detached runtimes without schema drift.
