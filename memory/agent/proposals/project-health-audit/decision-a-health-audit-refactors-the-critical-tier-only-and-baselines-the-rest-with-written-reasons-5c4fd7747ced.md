---
type: decision
title: "A health audit refactors the critical tier only and baselines the rest with written reasons"
description: "The ratified scope: fix all dead code and duplicate exports, extract every one- or two-file clone family, refactor only production critical-complexity functions, and give high/moderate rows a per-file justification."
resource: knowledge/project-health-audit/decision-a-health-audit-refactors-the-critical-tier-only-and-baselines-the-rest-with-written-reasons-5c4fd7747ced.md
tags:
  - analysis
  - complexity
  - fallow
  - scope
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
The project-health-audit plan (2026-09-28..29) removed 133 dead-code identities and 41 clone families and decomposed every production function Fallow rated critical, but it deliberately left the high and moderate tiers in place with a written justification per file in docs/fallow-exceptions.md and refreshed changed-scope floors. The reason is behavior risk: INV-002 (remediation preserves observable behavior) outranks remediation scope, so a function is only refactored once characterization tests exist for it, and the cost of characterizing every high/moderate function exceeded the value. Test-file criticals are baselined, not refactored, because their complexity is the case count they hold. Two three-file clone families stay baselined on record: judgment-provider/consolidation-proposals/retirement-receipts validation helpers and the readExactBytes trio.
