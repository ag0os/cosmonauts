---
id: TASK-535
title: 'Gate resolution vocabulary for bound, unbound, failed, and unsupported gates'
status: In Progress
priority: high
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
dependencies: []
createdAt: '2026-07-30T16:29:02.078Z'
updatedAt: '2026-07-30T16:35:00.204Z'
---

## Description

Stage 1 of `missions/plans/analysis-gate-rewiring/plan.md`. Amend the
generic gate-contract reference so the bound/unbound/failed/unsupported
resolution vocabulary exists before any consumer prompt references it.
Nothing else in this slice may use `failed-to-run` until this lands.

Read Design section 1 and decisions D-009, D-013, D-016 first, plus the
capability vocabulary the runtime slice already delivered in
`docs/analysis-capabilities.md`. That vocabulary is the ground.

Ratified ground: INV-1 governs this file — `gate-contracts.md` is a
generic work-artifact reference and must name no concrete provider, tool,
or command. AC-001 forbids a second vocabulary: every capability or gate
name used here must already be defined by `analysis-capability-runtime`.
Do not edit spec Intent/ACs or D-013/D-024/D-025 without a human decision;
route collisions through the deviation classifier.

B-015 names `gate-contracts.md` as one of its two seams; this task
delivers that half only. B-015's named test and marker land with the
Quality Manager rewiring task — do not add them here.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 `domains/shared/skills/work-artifacts/references/gate-contracts.md` defines four resolution outcomes for a bindable gate: bound-and-completed (evaluate the actual verdict), genuinely unbound (degraded — not enforced, reviewer judgment), failed binding or invocation (failed-to-run, blocking), and unsupported metric (degrade only that metric).
- [x] #2 The failed-to-run outcome is stated as never a pass and never a silent degradation, distinct from the unbound degraded state (`INV-3`, `D-009`).
- [x] #3 The unsupported-metric outcome degrades only the unavailable metric and is never treated as zero (`AC-007`, `D-016`).
- [x] #4 The amendment introduces no capability or gate name that `analysis-capability-runtime` did not already define (`AC-001`).
- [x] #5 `gate-contracts.md` still contains no concrete provider name, tool name, or runnable command, and the existing gate-kind, tier, binding-state, artifact-conformance-scope, and ladder-shape sections remain intact (`INV-1`).
- [ ] #6 Existing generic-artifact content tests covering `gate-contracts.md` still pass, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->

## Implementation Notes

partial
