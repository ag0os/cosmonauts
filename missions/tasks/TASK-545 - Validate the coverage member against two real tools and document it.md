---
id: TASK-545
title: Validate the coverage member against two real tools and document it
status: To Do
priority: high
labels:
  - 'plan:analysis-gate-coverage'
  - backend
dependencies:
  - TASK-542
createdAt: '2026-07-31T15:45:17.727Z'
updatedAt: '2026-07-31T15:45:17.727Z'
---

## Description

Stage 3 of `missions/plans/analysis-gate-coverage/plan.md`.
Implements B-044 (sources AC-014) and the capability-doc update from the
plan's Files to Change.

INV-4 requires the capability contract to stay provider-agnostic: a
generic field's schema must be plausible for at least two real tools, at
most one of which is Fallow. Establish that for the new coverage member
before the consumer depends on it, rather than assuming it.

The record lives in `docs/analysis-provider-validation.md` and must follow
AC-002's existing standard, which the B-002 test already enforces
mechanically: the "Generic result field evidence" table's rows must equal
`ANALYSIS_RESULT_GENERIC_FIELDS` in order; the reference cell starts with
`Fallow 2.54.2:`; the independent cell names a non-Fallow tool from the
documented reference set; the decision cell is `generic`; and "Fallow"
appears exactly once across the two evidence cells.

Anything about coverage that only one provider can express stays in the
provider-tagged table rather than the generic row.

Also update `docs/analysis-capabilities.md`: it currently promises only
"audit changes from an explicit base" and never states coverage — which is
the documentation half of D-029. State that completed verdict-bearing
results declare their evaluated gate coverage, and that operational
`trace`/`fix-preview` results carry `verdict: "not-applicable"` and declare
none.

Seam: `docs/analysis-provider-validation.md`
Test: `tests/analysis/contracts.test.ts` >
`records two tool validation for declared gate coverage`
Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-044`

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close. Ratified ground: INV-1..INV-5, D-013, D-024,
D-025, D-029, D-030, D-031. Shipped docs stay stack-agnostic.


<!-- AC:BEGIN -->
- [ ] #1 `ANALYSIS_RESULT_GENERIC_FIELDS` includes the coverage leaf field and the existing B-002 proof stays green with the field-evidence table in matching order
- [ ] #2 `docs/analysis-provider-validation.md` maps the coverage member to Fallow 2.54.2 reference evidence and to independent evidence from a second real tool that is not Fallow, with decision `generic`
- [ ] #3 Any aspect of coverage only one provider can express is recorded in the provider-tagged table rather than claimed as generic
- [ ] #4 `docs/analysis-capabilities.md` states that completed verdict-bearing results declare their evaluated gate coverage and that `trace`/`fix-preview` declare none
- [ ] #5 `tests/analysis/contracts.test.ts` proves the two-tool validation record exists for the coverage member in a test named `records two tool validation for declared gate coverage` carrying marker `@cosmo-behavior plan:analysis-gate-coverage#B-044`
- [ ] #6 The project test, lint, and type-check steps pass, and no existing test is deleted or rewritten to make the change green
<!-- AC:END -->
