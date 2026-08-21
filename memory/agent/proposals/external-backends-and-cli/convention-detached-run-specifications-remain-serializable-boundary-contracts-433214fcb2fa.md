---
type: convention
title: Detached run specifications remain serializable boundary contracts
description: >-
  Cross-process run specifications carry names and data, while runtime objects
  are reconstructed inside the detached process.
resource: >-
  knowledge/external-backends-and-cli/convention-detached-run-specifications-remain-serializable-boundary-contracts-433214fcb2fa.md
tags:
  - backends
  - contracts
  - process-boundary
  - serialization
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Treat the detached-process input as the same serializable run-specification contract used by the driver. Store backend names and primitive configuration rather than backend instances, closures, buses, or managers. Inside the detached process, deserialize the exact public shape and reconstruct runtime dependencies through explicit factories. Do not create a near-duplicate serialized type that can drift from the inline contract.
