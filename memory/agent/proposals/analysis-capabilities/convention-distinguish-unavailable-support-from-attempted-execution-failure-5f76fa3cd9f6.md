---
type: convention
title: Distinguish unavailable support from attempted execution failure
description: >-
  Capability resolution must model unbound, unsupported, and failed states
  separately because they imply different consumer behavior.
resource: >-
  knowledge/analysis-capabilities/convention-distinguish-unavailable-support-from-attempted-execution-failure-5f76fa3cd9f6.md
tags:
  - analysis
  - degradation
  - error-handling
  - state-model
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Use distinct outcomes for three cases: `unbound` when no provider can back a capability, `unsupported-*` when a bound provider cannot honor a requested metric or scope, and `failed` when discovery or execution was attempted but its correctness is uncertain. Consumers may openly degrade unbound or narrowly unsupported checks, but failures must block any clean verdict. Never translate a crash, invalid output, or introspection error into unsupported or zero findings.
