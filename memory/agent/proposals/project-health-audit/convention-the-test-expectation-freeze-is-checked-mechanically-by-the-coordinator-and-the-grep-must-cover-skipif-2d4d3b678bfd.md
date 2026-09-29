---
type: convention
title: "The test-expectation freeze is checked mechanically by the coordinator, and the grep must cover skipIf"
description: "Between slices the coordinator, not the worker, runs the diff-filter, porcelain and skip-grep commands from the slice-start commit; the grep pattern is \\.(skip|only|todo)(If)?\\(."
resource: knowledge/project-health-audit/convention-the-test-expectation-freeze-is-checked-mechanically-by-the-coordinator-and-the-grep-must-cover-skipif-2d4d3b678bfd.md
tags:
  - freeze
  - review
  - testing
timestamp: '2026-09-29T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/project-health-audit/plan.md
date: '2026-09-29T00:00:00.000Z'
---
The freeze rule allows new test files and pre-declared mechanical renames; any other modified, deleted or renamed test path, or any added skip/only/todo, stops the slice for human review. The observer is the coordinator between slices (git diff --name-status --diff-filter=MDR <base> <commit> -- tests/, porcelain, and the grep), because the worker has the incentive to skip it and under driver-commits HEAD does not contain the worker's edits until Drive commits. Codex found that the original grep missed test.skipIf(...); a root-user guard on a chmod-based case had passed silently. The pattern now includes the optional If suffix, and each conditional skip in a new file is reviewed and recorded in the task notes.
