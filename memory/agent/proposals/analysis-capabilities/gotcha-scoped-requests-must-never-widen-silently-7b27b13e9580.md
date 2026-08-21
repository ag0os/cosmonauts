---
type: gotcha
title: Scoped requests must never widen silently
description: >-
  Missing, empty, or unsupported scopes require explicit rejection or
  degradation before provider execution.
resource: >-
  knowledge/analysis-capabilities/gotcha-scoped-requests-must-never-widen-silently-7b27b13e9580.md
tags:
  - degradation
  - safety
  - scope
  - validation
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Validate scope values at runtime even when a schema already exists: bases, paths, and trace targets must be trimmed and nonempty. If a bound provider does not advertise the requested scope kind, return a structured unsupported-scope outcome before invocation, naming both requested and supported kinds. Never drop a filter, substitute project-wide analysis, or reuse a wider verdict; if a scoped verdict cannot be derived from scoped evidence, fail rather than guess.
