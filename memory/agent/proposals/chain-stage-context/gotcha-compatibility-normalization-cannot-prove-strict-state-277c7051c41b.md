---
type: gotcha
title: Compatibility normalization cannot prove strict state
description: >-
  A reader that defaults absent or unknown status to active is unsuitable for a
  gate that requires proof of active state.
resource: >-
  knowledge/chain-stage-context/gotcha-compatibility-normalization-cannot-prove-strict-state-277c7051c41b.md
tags:
  - compatibility
  - fail-closed
  - frontmatter
  - parsing
  - plans
timestamp: '2026-09-10T20:28:41.469Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/chain-stage-context/review-3.md
date: '2026-09-10T20:28:41.469Z'
---
Convenience readers often normalize malformed, absent, or unknown values to a permissive default for compatibility. A fail-closed authorization gate must not use such a value as proof. Read and parse the authoritative frontmatter strictly at the gate boundary, require the exact accepted state, and return a typed indeterminate result for missing, unknown, or unparseable status. Preserve the compatibility reader when changing its behavior would widen the public contract.
