---
type: decision
title: Keep framework infrastructure built in and distribute domains as packages
description: >-
  The framework retains only cross-domain infrastructure while functional
  domains are installed through the ordinary package system.
resource: >-
  knowledge/framework-extraction/decision-keep-framework-infrastructure-built-in-and-distribute-domains-as-packages-e3166df5beea.md
tags:
  - architecture
  - domains
  - framework-boundary
  - packages
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
Separate invariant framework infrastructure from replaceable domain content. Keep shared runtime capabilities built into the framework, but ship functional domains as installable packages discovered through the same scanner and resolver used for third-party packages. This avoids copying domain trees into every project and makes adding a domain a package-data change rather than a framework modification.
