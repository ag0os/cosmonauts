---
type: decision
title: "Characterize before you refactor, one metric per turn, and prove unreached sites by execution probe"
description: "Every below-high critical function gets a characterization commit before its first edit; claimed unreached return sites need a probe hit count of zero, not a fixture grep."
resource: knowledge/project-health-audit/decision-characterize-before-you-refactor-one-metric-per-turn-and-prove-unreached-sites-by-execution-probe-4b194ba253bc.md
tags:
  - characterization
  - probes
  - refactoring
  - testing
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
The plan fixed the order as: characterization commit C (new test files only), then the refactor slice measured from C. Workers repeatedly stopped blocked claiming a return site was unreachable after grepping test fixtures; two of three such claims were false. The standing rule (D-031, D-033) is that an unreached-site block must carry an execution probe: copy the source aside, append a marker per exit arm, run the full suite, count hits, restore byte-identical. Vitest v8 line coverage was unreliable for the scheduler file (duplicated function-map entries), so probes are the standard. Characterization tasks also sweep every return and throw site of the owned functions and pin each zero-hit site a shipped entry point can reach; the rest is listed as residual risk.
