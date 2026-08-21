---
type: gotcha
title: Unqualified role routing can depend on absence
description: >-
  A test proving an unqualified role resolves to a specific domain must assert
  that higher-priority domains do not define the same role.
resource: >-
  knowledge/coding-agnostic-framework/gotcha-unqualified-role-routing-can-depend-on-absence-a5c80afea366.md
tags:
  - domains
  - orchestration
  - routing
  - testing
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
Resolution of an unqualified role may appear stable only because another domain currently lacks that agent name. A routing test must assert both the final qualified id and the absence invariant that makes the result unambiguous. Otherwise adding the same role to the default domain can silently redirect orchestration while a shallow test that checks only the requested role continues to pass.
