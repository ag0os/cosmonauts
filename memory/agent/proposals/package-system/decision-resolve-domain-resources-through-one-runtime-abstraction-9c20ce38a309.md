---
type: decision
title: Resolve domain resources through one runtime abstraction
description: >-
  Downstream runtime components depend on a domain resolver rather than
  receiving and joining a single domain directory path.
resource: >-
  knowledge/package-system/decision-resolve-domain-resources-through-one-runtime-abstraction-9c20ce38a309.md
tags:
  - architecture
  - domains
  - resolver
  - runtime
timestamp: '2026-04-01T03:32:49.716Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/package-system/plan.md
date: '2026-04-01T03:32:49.716Z'
---
Construct one resolver after domain discovery and pass it to prompt assembly, extension resolution, session creation, and agent spawning. The resolver owns domain locations, merged roots, portability, fallback order, and fixed shared resources. Consumers ask for semantic resources rather than constructing filesystem paths, keeping future source or precedence changes localized.
