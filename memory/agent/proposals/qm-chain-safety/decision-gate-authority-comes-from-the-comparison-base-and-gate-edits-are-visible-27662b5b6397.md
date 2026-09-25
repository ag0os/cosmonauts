---
type: decision
title: 'Gate authority comes from the comparison base, and gate edits are visible'
description: >-
  Suppression exceptions, baselines and review config are read from the base
  revision; a change touching a gate-owned file cannot reach ready.
resource: >-
  knowledge/qm-chain-safety/decision-gate-authority-comes-from-the-comparison-base-and-gate-edits-are-visible-27662b5b6397.md
tags:
  - baselines
  - configuration
  - quality-gates
  - suppressions
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/qm-chain-safety/plan.md
date: '2026-09-23T00:00:00.000Z'
---
A new suppression directive needs an entry in the base revision's `.cosmonauts/suppression-exceptions.json`. A registry edit inside the reviewed change cannot authorize that change, while unchanged or moved registered directives stay authorized. The check (`bun run check:suppressions -- --base <rev>`) covers equivalent directive forms, renames, block comments and JSONC. Changed-scope analysis fails only on introduced findings, measured against the three committed Fallow baselines, which are refreshed only by the provenance-recording script. The `qualityReview` config is base-owned too, so a review against a base without it reports checks as not configured, which is expected. Any reviewed range that changes a gate-owned file is raised by host code as a human-decision item and cannot be `ready`. Gate-owned files are the registry, the checker and its policy, the Fallow adapter, the baselines and the `qualityReview` block. The principle: a gated party cannot move its own floor silently; weakening a gate is allowed only visibly. Running the checker from the base revision's code was rejected as circular when Cosmonauts reviews itself.
