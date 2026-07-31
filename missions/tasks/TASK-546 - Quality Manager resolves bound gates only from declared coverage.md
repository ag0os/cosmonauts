---
id: TASK-546
title: Quality Manager resolves bound gates only from declared coverage
status: Done
priority: high
labels:
  - 'plan:analysis-gate-coverage'
  - backend
dependencies:
  - TASK-544
  - TASK-545
createdAt: '2026-07-31T15:45:42.243Z'
updatedAt: '2026-07-31T16:25:00.171Z'
---

## Description

Stage 4 (consumer, last) of `missions/plans/analysis-gate-coverage/plan.md`.
Implements B-043 (sources AC-016).

The Quality Manager's gate resolution currently reads (lines 93-94 of
`bundled/coding/prompts/quality-manager.md`):

- "An aggregate `pass` resolves every covered bound gate as passed only
  when the result explicitly represents complete coverage for those gates."
- "A category with no matching finding is a pass only when the structured
  result makes complete coverage for that gate classifiable."

That wording is unsatisfiable against the shipped contract, which is why
every bound `duplication`/`complexity`/`dead-code` gate resolves to
`failed-to-run` today and sign-off is unreachable. Replace it with the
declared-coverage rule: pass a bound gate when the result's declared
coverage names that gate and no finding contradicts it; otherwise degrade
or report failed-to-run.

The consumer was never wrong — it refuses provider-native fields (INV-1)
and reports an unclassifiable gate as `failed-to-run` rather than guessing
(INV-3). Both stay. Keep line 95 ("If a bound gate has no classifiable
per-gate verdict, report it as `failed-to-run`, never as a pass"), line 96
(`trace`/`fix-preview` can never pass or fail a gate), and the instruction
not to inspect provider-specific native fields.

Do not disturb `analysis-gate-rewiring`'s review remediation, added at
`812c819` after codex review: the exclusive-bucket rule (line 76) and the
boundary-conformance own-capability resolution (line 84) stay. Replace only
the unsatisfiable "complete coverage" wording.

The test must assert the negative. The entire defect is a gate passing
without evidence — proving that a covered category passes is not enough.
Prove an undeclared category is NOT passed by absence of findings. Pin each
operative sentence rather than asserting a bare token: a test that checks
a token like `pass` appears somewhere passes on any prompt that mentions it.

Seam: `bundled/coding/prompts/quality-manager.md`
Test: `tests/prompts/quality-manager.test.ts` >
`resolves bound gates only from declared coverage`
Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-043`

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close. Ratified ground: INV-1..INV-5, D-013, D-024,
D-025, D-029, D-030, D-031. INV-1 governs shipped prompts: reference
capabilities, never concrete tool names or commands, and keep the prompt
stack-agnostic.

<!-- AC:BEGIN -->
- [x] #1 The prompt resolves a bound gate to `pass` only when the completed result declares that gate covered and no finding contradicts it
- [x] #2 A category outside the declared coverage is reported as degraded or failed-to-run and is never passed by absence of findings
- [x] #3 The unsatisfiable "complete coverage" wording is gone from the gate-resolution section, while the failed-to-run rule for unclassifiable gates, the `not-applicable` rule for `trace`/`fix-preview`, and the prohibition on reading provider-native fields remain
- [x] #4 The exclusive-bucket resolution rule and the boundary-conformance own-capability resolution added by `analysis-gate-rewiring` remain intact
- [x] #5 The prompt names no concrete tool, command, or provider and remains stack-agnostic (INV-1)
- [x] #6 `tests/prompts/quality-manager.test.ts` pins the operative sentences and proves the negative case — an undeclared category is not passed by absence of findings — in a test named `resolves bound gates only from declared coverage` carrying marker `@cosmo-behavior plan:analysis-gate-coverage#B-043`
- [x] #7 The project test, lint, and type-check steps pass, and no existing test is deleted or rewritten to make the change green
<!-- AC:END -->
