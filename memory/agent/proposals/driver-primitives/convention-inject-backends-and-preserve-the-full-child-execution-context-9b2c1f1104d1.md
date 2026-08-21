---
type: convention
title: Inject backends and preserve the full child execution context
description: >-
  Backend adapters receive dependencies from the integration layer and forward
  lineage and runtime-resolution context unchanged.
resource: >-
  knowledge/driver-primitives/convention-inject-backends-and-preserve-the-full-child-execution-context-9b2c1f1104d1.md
tags:
  - backend
  - dependency-injection
  - driver
  - lineage
timestamp: '2026-05-04T20:14:02.943Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/driver-primitives/plan.md
date: '2026-05-04T20:14:02.943Z'
---
Keep orchestration-core modules independent of domain integrations by constructing concrete backends at the boundary and injecting their spawner or process dependencies. A child-agent backend must forward not only prompt, role, working directory, and cancellation, but also plan identity, parent-session lineage, task runtime context, domain context, skill selections, and activity callbacks. Omitting these optional-looking fields can silently disable lineage or alter child runtime resolution.
