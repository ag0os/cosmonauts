---
id: TASK-550
title: Plan Reviewer challenges with capability evidence or names its absence
status: Done
priority: high
labels:
  - 'plan:analysis-investigation-procedures'
  - documentation
  - testing
dependencies:
  - TASK-549
createdAt: '2026-08-05T15:24:21.075Z'
updatedAt: '2026-08-05T15:32:03.844Z'
---

## Description

Stage 1 of `missions/plans/analysis-investigation-procedures/plan.md`.
Implements B-021 (sources AC-010).

The Plan Reviewer's adversarial dimensions — code-path duplication,
dependency direction against a declared architecture record, and proposed
deletions — are exactly the checks the capability surface can support. Its
prompt currently tells it to grep and read code, with no procedure for
using structural evidence and no rule against implying a check that never
ran.

Obligations the prompt must carry:

- When checking duplicate code paths, dependency direction, and proposed
  deletions, check the runtime bindings and use capability evidence
  alongside reading the code.
- A finding that rests on capability evidence cites that evidence. Where
  the evidence was unavailable, the review says so plainly rather than
  implying the check was performed. The existing Coverage Ledger's
  `unchecked` status is the natural home for that statement — an
  unavailable capability is an `unchecked` dimension with the reason
  stated, never a silent `checked`.
- Investigation roles use the two-way protocol only: evidence, or no
  evidence — record it (D-021). The Plan Reviewer gates nothing, so the
  prompt must NOT teach it to distinguish failed from unbound and must NOT
  make it block on any capability state.
- The prompt does not restate the shared analysis skill's common protocol.

INV-1 is the hard constraint: no concrete analyzer name, no provider name,
no command anywhere in the added content.

Note the prompt's existing live-probe paragraph under Review Dimensions
(external-tool verification with read-only invocations). That paragraph is
about probing a tool a *plan under review* wraps; it is not analysis
procedure and must be preserved as-is.

Seam: `bundled/coding/prompts/plan-reviewer.md`
Test: `tests/prompts/analysis-procedures.test.ts` >
`expresses plan review challenges in capability terms`
Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-021`

The test lands before the prompt edit. Pin operative sentences, not bare
tokens.

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close.

Ratified ground: INV-1..INV-5, D-013, D-021. Do not un-withdraw B-020. Do
not touch the capability runtime, the gate vocabulary, or any other role's
prompt.

<!-- AC:BEGIN -->
- [x] #1 Plan Reviewer prompt instructs checking runtime capability bindings and using capability evidence when challenging duplicate code paths, dependency direction, and proposed deletions
- [x] #2 Plan Reviewer prompt requires a finding resting on capability evidence to cite it, and requires unavailable evidence to be stated plainly — recorded as an `unchecked` Coverage Ledger dimension with its reason — never implied as checked
- [x] #3 Plan Reviewer procedure stays two-way (evidence vs no evidence — record it): it does not distinguish failed from unbound and does not block on any capability state (D-021)
- [x] #4 The existing live-probe paragraph and the existing Coverage Ledger requirement are preserved, and `tests/prompts/plan-reviewer.test.ts` still passes unchanged
- [x] #5 No concrete analyzer name, provider name, or runnable command appears anywhere in `bundled/coding/prompts/plan-reviewer.md`
- [x] #6 `tests/prompts/analysis-procedures.test.ts` contains a test named `expresses plan review challenges in capability terms` carrying marker `@cosmo-behavior plan:analysis-investigation-procedures#B-021`, which pins the operative sentence of each obligation above rather than bare tokens, and asserts the absence of any provider name across the whole prompt
- [x] #7 The project test, lint, and type-check steps pass, and no existing test is deleted, renamed, or weakened
<!-- AC:END -->
