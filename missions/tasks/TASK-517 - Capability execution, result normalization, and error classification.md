---
id: TASK-517
title: 'Capability execution, result normalization, and error classification'
status: To Do
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies:
  - TASK-516
createdAt: '2026-07-29T16:40:48.862Z'
updatedAt: '2026-07-29T16:40:48.862Z'
---

## Description

Stage 3 of `missions/plans/analysis-capability-runtime/plan.md`, second
half. Implement one behavior at a time against the envelopes captured in
the pin task.

Read Design §1 and §3 and decisions D-012, D-013, D-020, D-022 first.
D-012 exists because ordinary analysis writes a provider cache into the
worktree without the no-cache option — INV-5 covers every capability tool,
not only fix application, and cleaning up afterwards is not acceptable.

Ratified ground: D-013 is ratified — trace and fix-preview never carry a
fabricated verdict, and fabricating one is itself a normalization error.
INV-3 and INV-5 outrank coverage: output that cannot be classified is an
error, never a guess. AC-003, AC-005, AC-006, AC-008, and AC-011 are spec
criteria.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [ ] #1 `B-007` — analysis-kind results carry capability, provider, version, scope, base, and verdict, while trace and fix-preview carry `verdict: "not-applicable"` with their evidence and proposals (`D-013`, ratified); every result preserves the complete provider-tagged native payload, stderr, and exit without truncation.
- [ ] #2 `B-008` — a provider exit of 1 with valid findings JSON is a completed failing analysis with all findings and actions present: no exception and no flattening into prose.
- [ ] #3 `B-009` — exit 2, an error envelope, invalid JSON, or JSON that cannot support a verdict for a verdict-bearing capability throws an `AnalysisProviderError` whose message names failed-to-run status, capability, provider, failure class, and process evidence (`D-020`); a successful trace or fix-preview completes without a fabricated verdict and without throwing.
- [ ] #4 `B-010` — changed-scope audit errors before provider invocation on a missing, empty, or whitespace base and never widens; a valid base is passed literally and echoed in the result scope.
- [ ] #5 `B-012` — a whole-worktree snapshot including ignored provider cache paths is byte-identical before and after status plus every capability including fix preview; every invocation disables caches, fix preview is dry-run, and no apply tool exists.
- [ ] #6 Tests carry the `@cosmo-behavior plan:analysis-capability-runtime#B-007` through `#B-010` and `#B-012` markers, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
