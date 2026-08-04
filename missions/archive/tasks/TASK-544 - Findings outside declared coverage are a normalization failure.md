---
id: TASK-544
title: Findings outside declared coverage are a normalization failure
status: Done
priority: high
labels:
  - 'plan:analysis-gate-coverage'
  - backend
dependencies:
  - TASK-543
createdAt: '2026-07-31T15:45:17.724Z'
updatedAt: '2026-07-31T16:14:50.196Z'
---

## Description

Stage 2 (second half) of `missions/plans/analysis-gate-coverage/plan.md`.
Implements B-042 (sources AC-015).

This check is what makes declared coverage trustworthy. Without it an
adapter can declare anything. A normalized finding whose category falls
outside the result's declared coverage is a contradiction between the
provider's own output and its own coverage claim: raise an
`AnalysisFailure` preserving the evidence. Never reconcile it by widening
the declared coverage and never by dropping the finding.

Reuse the established failure-evidence shape (D-020): the thrown
`AnalysisProviderError` message names capability, provider, failure class,
and process evidence. Do not invent a second shape.

The check applies to every verdict-bearing path — each single-capability
normalization and the audit — not only the audit.

Guard against the check firing on legitimate output: with boundary zones
and rules configured, a `boundary-conformance` finding from a `dead-code`
or audit invocation is covered by D-031 and must normalize to a result, not
a failure. With no zones configured, the same finding is a genuine provider
contradiction and must fail.

Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
Test: `tests/extensions/project-tools-fallow.test.ts` >
`rejects findings outside the declared gate coverage`
Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-042`

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close. Ratified ground: INV-1..INV-5, D-013, D-020,
D-024, D-025, D-029, D-030, D-031. INV-3 governs: an unclassifiable result
is reported as an error, never guessed at.

<!-- AC:BEGIN -->
- [x] #1 Normalization raises an `AnalysisFailure` when any normalized finding carries a category outside the result's declared coverage, on both single-capability and changed-scope-audit paths
- [x] #2 The contradiction is never reconciled by widening the declared coverage or by dropping the offending finding
- [x] #3 The raised failure preserves the provider evidence and names capability, provider, failure class, and process evidence in the shape established by D-020
- [x] #4 A `boundary-conformance` finding produced by a dead-code or audit invocation with boundary zones and rules configured still normalizes to a result rather than a failure
- [x] #5 `tests/extensions/project-tools-fallow.test.ts` proves both a boundary finding with no configured zones and a non-boundary cross-category case are rejected, in a test named `rejects findings outside the declared gate coverage` carrying marker `@cosmo-behavior plan:analysis-gate-coverage#B-042`
- [x] #6 The project test, lint, and type-check steps pass, and no existing test is deleted or rewritten to make the change green
<!-- AC:END -->
