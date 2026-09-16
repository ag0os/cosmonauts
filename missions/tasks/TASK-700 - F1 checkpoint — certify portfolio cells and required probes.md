---
id: TASK-700
title: F1 checkpoint — certify portfolio cells and required probes
status: To Do
priority: high
labels:
  - testing
  - 'plan:test-health-audit'
dependencies:
  - TASK-699
createdAt: '2026-09-16T18:36:39.062Z'
updatedAt: '2026-09-16T18:36:39.062Z'
---

## Description

Stage 7 gate **F1**. Owned behaviors: **none**; TASK-698 solely owns B-007 and TASK-699 solely owns B-008.

This checkpoint evaluates plan-recorded targeted mutation evidence without binding a generic mutation gate. Bound correctness and artifact-conformance run first; the mutation row remains bindable/unbound and degrades visibly rather than silently passing.

<!-- AC:BEGIN -->
- [ ] #1 No critical `protected` portfolio is missing an applicable boundary/path/caller/defect-axis cell or a probe required by any of the five unconditional triggers, and every critical portfolio cell's probe references resolve to a current-epoch `probes.jsonl` record or a recorded infeasibility limitation — so a matrix that predates the probe stage fails F1 rather than passing with no `protected` cells.
- [ ] #2 Every executed required probe satisfies copied-graph containment, isolated-defect, expected-red or survived outcome, source-checkout preservation, restored-sandbox-green evidence, narrowest-declaration selection, and attributed failing-declaration identity; `git checkout` appears in no restoration path.
- [ ] #3 Every unsafe or unprovable required probe is visibly `reasoned`/`unassessed` with a limitation and remains uncounted, and every `probe-survived` result is uncounted and linked to an open remediation row.
- [ ] #4 B-007 and B-008 correctness and exact marker artifact-conformance pass, while the generic `mutation` gate is explicitly recorded as unbound, not enforced, and subject to the plan’s targeted evidence and agent-assessed judgment.
<!-- AC:END -->
