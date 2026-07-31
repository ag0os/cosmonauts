---
id: TASK-542
title: Contract — declare evaluated gate coverage on verdict-bearing results
status: Done
priority: high
labels:
  - 'plan:analysis-gate-coverage'
  - backend
dependencies: []
createdAt: '2026-07-31T15:44:31.559Z'
updatedAt: '2026-07-31T15:54:32.535Z'
---

## Description

Stage 1 (contract first) of `missions/plans/analysis-gate-coverage/plan.md`.
Implements B-040 (sources AC-013).

A completed verdict-bearing result carries one aggregate `verdict` plus
`findings[]` whose `category` is a gate capability, but nothing declaring
which gate categories were actually evaluated (D-029). Add that declaration
to the contract in `lib/analysis/types.ts`.

Encode it as a type, not a convention — slice 1's established pattern
(D-013 became a literal type so fabricating a verdict is a compile error).
Coverage is a non-empty readonly array of the existing
`AnalysisGateCapability` union, required on every verdict-bearing result
(D-030: uniform presence, including single-capability results; an optional
field is indistinguishable from missing coverage at the consumer, which
recreates the exact gap). Absent or empty coverage must fail `tsc`, not
just a test.

D-013 is ratified: `trace` and `fix-preview` carry
`verdict: "not-applicable"` and gain no coverage member. Extending coverage
there reintroduces the fabricated-meaning problem D-013 closed.

Adding a required member is breaking. Every construction site must move in
the same change — that loud type-check failure is the desired mechanism,
not a problem to route around. The blast radius is in-repo only:
`domains/shared/extensions/project-tools/fallow-provider.ts` (two
verdict-bearing construction sites) and
`tests/extensions/project-tools-fallow.test.ts`.

Do not add the new leaf field to `ANALYSIS_RESULT_GENERIC_FIELDS` or touch
`docs/analysis-provider-validation.md` here — the registry entry and its
two-real-tool validation row belong to the B-044 task, and adding the const
entry without the doc row breaks the existing B-002 proof.

Seam: `lib/analysis/types.ts`
Test: `tests/analysis/contracts.test.ts` >
`declares evaluated gate coverage on every verdict bearing result`
Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-040`

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close. Ratified ground for this plan: INV-1..INV-5
(spec `## Intent`), D-013, D-024, D-025, D-029, D-030, D-031 — do not
re-litigate or amend without a human decision on the record. Do not change
the seven capability names or the gate vocabulary.

<!-- AC:BEGIN -->
- [x] #1 Every completed verdict-bearing result (`dead-code`, `duplication`, `complexity`, `boundary-conformance`, `changed-scope-audit`) carries a required coverage member drawn from the existing `AnalysisGateCapability` union, with no new gate name and no provider-specific member
- [x] #2 The coverage member is typed so that an absent or empty coverage list is a `tsc` error rather than a test-only failure
- [x] #3 `trace` and `fix-preview` results gain no coverage member and keep `verdict: "not-applicable"` (D-013)
- [x] #4 Every construction site across `lib/`, `domains/`, `bundled/`, and `tests/` is updated in the same change and the type-check gate is clean
- [x] #5 `tests/analysis/contracts.test.ts` proves presence on each verdict-bearing kind and absence on `trace`/`fix-preview` in a test named `declares evaluated gate coverage on every verdict bearing result` carrying marker `@cosmo-behavior plan:analysis-gate-coverage#B-040`
- [x] #6 `ANALYSIS_RESULT_GENERIC_FIELDS` and `docs/analysis-provider-validation.md` are unchanged by this task, and the existing B-002 validation proof stays green
- [x] #7 The project test, lint, and type-check steps pass, and no existing test is deleted or rewritten to make the change green
<!-- AC:END -->
