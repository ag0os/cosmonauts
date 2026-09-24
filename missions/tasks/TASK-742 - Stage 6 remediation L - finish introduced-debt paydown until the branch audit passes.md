---
id: TASK-742
title: >-
  Stage 6 remediation L - finish introduced-debt paydown until the branch audit
  passes
status: To Do
priority: high
labels:
  - refactoring
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-741
createdAt: '2026-09-24T13:40:06.942Z'
updatedAt: '2026-09-24T13:40:06.942Z'
---

## Description

This is the final part of the introduced-debt paydown. It carries the original whole-branch criteria of TASK-740: the branch's own changed-scope audit against `main`, with the committed baselines, must pass. The rules are the same as TASK-741: a behavior-preserving refactor, no baseline re-save, no suppressions, and characterization tests where needed. It covers the remaining complexity findings, including test and script files, and the duplication clone groups.


<!-- AC:BEGIN -->
- [ ] #1 The changed-scope audit (`npx fallow audit --base main --dead-code-baseline .fallow-baselines/dead-code.json --health-baseline .fallow-baselines/health.json --dupes-baseline .fallow-baselines/dupes.json`) returns verdict `pass` with zero introduced dead-code, complexity and duplication findings.
- [ ] #2 Duplicated blocks introduced on this branch are consolidated into shared helpers; no unused exports or types remain.
- [ ] #3 Behavior, output and event order are unchanged; no baseline changed; `bun run check:suppressions -- --base main` passes; typecheck, lint on tracked paths and the full suite pass.
<!-- AC:END -->
