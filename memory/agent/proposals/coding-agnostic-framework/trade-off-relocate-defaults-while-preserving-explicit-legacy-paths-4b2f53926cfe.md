---
type: trade-off
title: Relocate defaults while preserving explicit legacy paths
description: >-
  Move omitted-input defaults to framework ownership while temporarily retaining
  the old domain-owned asset for explicit callers.
resource: >-
  knowledge/coding-agnostic-framework/trade-off-relocate-defaults-while-preserving-explicit-legacy-paths-4b2f53926cfe.md
tags:
  - compatibility
  - migration
  - orchestration
  - prompts
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
When decoupling a default asset from an optional domain, stop all framework defaults from referencing the old path but keep an unchanged compatibility copy for callers and persisted run specifications that explicitly name it. Test both omitted-input resolution and the explicit legacy path. This avoids an unnecessary compatibility break, at the accepted cost of temporary duplication that a later extraction wave must remove deliberately.
