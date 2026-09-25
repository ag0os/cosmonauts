---
type: decision
title: >-
  Plans stop declaring quality gates; the reviewer resolves them from the
  runtime
description: >-
  The Quality Contract gate table left the plan format, and the quality-manager
  resolves every gate kind with a runtime capability on every run.
resource: >-
  knowledge/framework-health/decision-plans-stop-declaring-quality-gates-the-reviewer-resolves-them-from-the-runtime-da28a262be70.md
tags:
  - analysis
  - planning
  - quality-gates
  - quality-manager
timestamp: '2026-09-21T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/framework-health/plan.md
date: '2026-09-21T00:00:00.000Z'
---
A plan's gate table was a planner's prediction of something only the runtime knows: which analysis capabilities are bound. Its binding-state column was provenance only, because binding is computed from provider detection at run time. It could not simply be deleted, though, because the quality-manager prompt resolved gates "for every bindable row": with no table, the duplication, complexity, dead-code and boundary gates would silently stop running. The fix was to make the quality-manager resolve every gate kind with a runtime capability, with or without a plan, keeping the established rules: exclusive outcome, failed-to-run blocks, unbound degrades, and verdicts only from declared coverage. The table then left the format. Legacy `QC-*` lists in older plans are still honored. Before deleting a document section, trace whether a prompt reads it: prose can be load-bearing even when no code parses it.
