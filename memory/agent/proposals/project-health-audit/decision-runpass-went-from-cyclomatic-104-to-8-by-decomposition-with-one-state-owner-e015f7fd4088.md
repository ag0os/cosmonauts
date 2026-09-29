---
type: decision
title: "runPass went from cyclomatic 104 to 8 by decomposition with one state owner"
description: "The largest production function (living-memory runPass, 886 lines, cyclomatic 104, cognitive 133, CRAP 2440) was split into recovery, collection, execution, judgment and assembly helpers that write through one state owner."
resource: knowledge/project-health-audit/decision-runpass-went-from-cyclomatic-104-to-8-by-decomposition-with-one-state-owner-e015f7fd4088.md
tags:
  - complexity
  - living-memory
  - refactoring
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
lib/memory/living-memory.ts runPass measured cyclomatic 104, cognitive 133, CRAP 2440.3 over 886 lines with partial static coverage. After TASK-781 characterized ten run-pass cases and TASK-782 decomposed it, runPass measures 8/8 and recoverAcceptedEpisodeFinalization 5/4, with 24 new private helpers none above cyclomatic 9 or cognitive 14. The design constraint that mattered: one state owner with write-through of details, writesCommitted and episodePrunes, and unchanged ordering of episode prunes versus commits, so the interleaving characterization tests kept passing. Codex reviewed the decomposition over five rounds and found no correctness or liveness regression.
