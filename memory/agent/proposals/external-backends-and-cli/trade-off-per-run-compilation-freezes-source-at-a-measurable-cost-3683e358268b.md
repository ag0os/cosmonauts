---
type: trade-off
title: Per-run compilation freezes source at a measurable cost
description: >-
  Compiling a self-contained worker at run creation isolates detached execution
  from source mutation but adds startup time and substantial disk use.
resource: >-
  knowledge/external-backends-and-cli/trade-off-per-run-compilation-freezes-source-at-a-measurable-cost-3683e358268b.md
tags:
  - compilation
  - detached-execution
  - reproducibility
  - trade-off
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Compile the detached worker once when creating a run so its code and imported dependencies remain stable even if the host source tree changes or disappears. Accept that this adds several seconds of startup latency and a large binary in every run work directory. Record the resolved source location for provenance and make completed work directories disposable; do not pretend the compile step is a negligible implementation detail.
