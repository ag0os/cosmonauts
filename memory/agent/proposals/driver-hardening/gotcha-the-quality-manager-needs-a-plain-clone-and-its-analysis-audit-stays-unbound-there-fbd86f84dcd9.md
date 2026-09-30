---
type: gotcha
title: >-
  The Quality Manager needs a plain clone and its analysis audit stays unbound
  there
description: >-
  The QM refuses linked git worktrees; from a fresh plain clone it produced its
  first-ever verdict, but Fallow reports execution-not-consented in the private
  clone so every verdict carries unavailable evidence.
resource: >-
  knowledge/driver-hardening/gotcha-the-quality-manager-needs-a-plain-clone-and-its-analysis-audit-stays-unbound-there-fbd86f84dcd9.md
tags:
  - fallow
  - quality-manager
  - review
  - worktrees
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/coordinator-status.md
date: '2026-09-30T00:00:00.000Z'
---
# The Quality Manager needs a plain clone and its analysis audit stays unbound there

`cosmonauts run chain "coding/quality-manager"` fails in milliseconds from a linked worktree with "Unsupported linked worktree layout" (its private-workspace preparation requires .git to be a directory). From a fresh `git clone --branch <branch> <worktree> <scratch>` plus `bun install`, it ran to completion for the first time on driver-hardening (about eight minutes, four reviewer lenses, host checks executed in the private snapshot) after two earlier clone attempts had failed with "Missing reviewer evidence". Its artifacts live under the clone's missions/sessions/chain/runs/<qm-run>/artifacts/qm/; copy them into missions/reviews/qm/<plan>-run-N/ with a README carrying the coordinator's dispositions.

Standing gap: in the private clone every Fallow capability reports execution-not-consented, so analysis_audit is unbound and the verdict lists it as a human-decision item on every plan. Follow-up TASK-815 owns the fix; until then, state "unavailable evidence, not a clean result" in the final report. The QM found real defects codex had not (a parser precedence case, a mode-blind containment check, an identity-less commit-tree), and also raised findings that plumbing behavior refutes (diff-tree without -M emits no rename records); verify each against the code before routing.
