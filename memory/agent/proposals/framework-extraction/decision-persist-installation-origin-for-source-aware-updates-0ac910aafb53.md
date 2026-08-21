---
type: decision
title: Persist installation origin for source-aware updates
description: >-
  Every installed package records its origin so updates can dispatch to the
  correct source-specific strategy.
resource: >-
  knowledge/framework-extraction/decision-persist-installation-origin-for-source-aware-updates-0ac910aafb53.md
tags:
  - metadata
  - packages
  - provenance
  - updates
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
Write package installation provenance beside the installed package, including the source kind, its stable locator, and installation time. Update behavior then follows the recorded origin: refresh bundled catalog packages from their catalog entry, update version-control sources through that source, treat links as already live, and avoid guessing how to refresh opaque local copies. Provenance turns update from path inference into an explicit contract.
