---
type: decision
title: Verdicts belong only to verdict-bearing result kinds
description: >-
  Operational evidence such as traces and previews should use a not-applicable
  verdict rather than inventing pass/fail semantics.
resource: >-
  knowledge/analysis-capabilities/decision-verdicts-belong-only-to-verdict-bearing-result-kinds-baba5126c16b.md
tags:
  - contracts
  - normalization
  - types
  - verdicts
timestamp: '2026-07-29T16:36:48.071Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/analysis-capabilities/plan.md
date: '2026-07-29T16:36:48.071Z'
---
Discriminate result contracts by semantic kind. Analyses that evaluate a quality condition may carry a real pass/fail verdict; operations that return evidence or proposed changes should carry an explicit `not-applicable` verdict or an equivalent typed variant. Do not infer failure from “evidence exists” or success from “no proposal exists” unless the provider contract asserts that meaning. Encode this distinction in types so fabricated verdicts are structurally impossible.
