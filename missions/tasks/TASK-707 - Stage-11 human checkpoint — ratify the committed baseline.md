---
id: TASK-707
title: Stage-11 ratification packet — the audit's single human decision
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-706
createdAt: '2026-09-16T18:38:11.684Z'
updatedAt: '2026-09-16T18:38:11.684Z'
---

## Description

Stage 11 — the audit's single human decision point (spec `INV-008`/`AC-016`, plan D-029). Owned behaviors: **none**; TASK-705 is the sole B-011 owner.

Everything upstream ran unattended. The owner receives one packet and answers it in one pass: the baseline decision, the accepted residual uncertainty, and every contract question that turned out to lack a ratified authority. If this task finds that any earlier stage solicited human input, that is a defect in the stage, not work for the owner.

This is a real dependency gate reserved to the project owner. Automation and worker agents may present evidence but may not write the ratification block, accept uncertainty, declare `established`, complete the plan, resume feature work, or begin `project-health-audit`. INV-007 and D-004/D-010 are ratified stop-and-escalate ground.

<!-- AC:BEGIN -->
- [ ] #1 The project owner is presented with the already-committed evaluated revision and canonical candidate digest, all critical portfolios, remediation ledger, targeted probes, and residual-uncertainty IDs.
- [ ] #2 Only the project owner appends a ratification block naming the exact evaluated revision/digest and explicitly accepted noncritical uncertainty IDs; validator recomputation remains identical despite the later excluded owner block.
- [ ] #3 `established` is recorded only when all eight baseline conditions pass with the exact owner decision; absent, declined, mismatched, or stale ratification leaves the baseline `not established` and the plan active.
- [ ] #4 Feature/active-plan resumption and the separate `project-health-audit` handoff occur only after establishment; this checkpoint does not implement or start `project-health-audit`.
<!-- AC:END -->
