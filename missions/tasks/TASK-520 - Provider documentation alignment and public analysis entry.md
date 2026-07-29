---
id: TASK-520
title: Provider documentation alignment and public analysis entry
status: To Do
priority: medium
labels:
  - 'plan:analysis-capability-runtime'
  - devops
dependencies:
  - TASK-519
createdAt: '2026-07-29T16:40:48.869Z'
updatedAt: '2026-07-29T16:40:48.869Z'
---

## Description

Stage 6 of `missions/plans/analysis-capability-runtime/plan.md`, closing
this slice. Documentation is written against what shipped, so it comes
after the runtime rather than alongside it.

Provider-specific documentation and runtime source are explicit exclusions
from the INV-1 generic-content scan; shipped prompts, skills, and generic
work-artifact references are included. Nothing in this task should add a
provider name to a shipped generic surface.

The final acceptance criterion is this slice's artifact-conformance gate:
every non-withdrawn behavior has its named test and exact marker, with
`B-032` withdrawn and reported as such.

Ratified ground: INV-1 — shipped prompts, skills, and generic artifacts
reference capabilities, never concrete tool names or commands. AC-011 and
AC-012 are spec criteria.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 The capability documentation and the provider validation record are complete and describe the contract as delivered rather than as planned; the capability documentation stays provider-neutral while the validation record is deliberately concrete.
- [ ] #2 The provider workflow and exceptions documentation describe the capability runtime, and their Current Gate section and provider-config entry documentation no longer drift from it.
- [ ] #3 The provider config declares the analysis public entry so the exported contract is a recognized boundary.
- [ ] #4 Links to the shipped provider skill remain valid: that skill is still shipped in this slice and is deleted by `analysis-gate-rewiring`.
- [ ] #5 The ROADMAP analysis-tools entry is left to the final slice; no premature completion claim is recorded anywhere.
- [ ] #6 `cosmonauts plan check-artifacts analysis-capability-runtime` reports zero issues with `Withdrawn: 1`, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
