---
id: TASK-549
title: Planner investigates through capabilities before designing
status: To Do
priority: high
labels:
  - 'plan:analysis-investigation-procedures'
  - documentation
  - testing
dependencies: []
createdAt: '2026-08-05T15:24:21.070Z'
updatedAt: '2026-08-05T15:24:21.070Z'
---

## Description

Stage 1 of `missions/plans/analysis-investigation-procedures/plan.md`.
Implements B-019 (sources AC-010).

The Planner already holds the capability tools and the shared analysis
skill (delivered by the two prior slices) but has no procedure of its own
telling it to gather structural evidence before designing. Write that
procedure into the Planner prompt, expressed entirely in capability terms.

Obligations the prompt must carry:

- Before designing non-trivial work, check the runtime bindings, then
  gather evidence for the areas the design will touch: complexity,
  duplication, boundary conformance, and traces of symbols the design
  moves, reuses, or removes.
- Evidence enters the design and the risk register. Where a capability
  produced no evidence, the design records that uncertainty explicitly
  instead of assuming a clean baseline. Missing evidence is never a clean
  result.
- Investigation roles use the two-way protocol only: evidence, or no
  evidence — record it (D-021). The Planner gates nothing, so the prompt
  must NOT teach it to distinguish failed from unbound, and must NOT make
  it block on any capability state. Doing so drifts past D-021 and past
  AC-010's letter.
- The prompt does not restate the shared analysis skill's common protocol
  (availability check, explicit base, trace-first, preview-only). It adds
  only Planner-specific procedure.

INV-1 is the hard constraint: no concrete analyzer name, no provider name,
no command, no CLI incantation anywhere in the added content. Generic
capability tool names registered by the runtime are the vocabulary.

Seam: `bundled/coding/prompts/planner.md`
Test: `tests/prompts/analysis-procedures.test.ts` >
`expresses planner investigation in capability terms`
Marker: `@cosmo-behavior plan:analysis-investigation-procedures#B-019`

The test lands before the prompt edit. Pin the operative sentence for each
obligation — a test asserting that a bare token such as `unbound` appears
passes on any prompt that merely mentions it, which is a defect slice 2
already shipped once and had to fix.

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close.

Ratified ground: INV-1..INV-5, D-013, D-021. Do not un-withdraw B-020 or
add an Explorer procedure. Do not touch the capability runtime, the gate
vocabulary, the seven capability names, or any other role's prompt.


<!-- AC:BEGIN -->
- [ ] #1 Planner prompt instructs checking runtime capability bindings and gathering complexity, duplication, boundary, and trace evidence for the areas a design will touch, before the design is written
- [ ] #2 Planner prompt requires capability evidence — or its explicit absence — to be recorded in the design and risks, and states that missing evidence is never read as a clean baseline
- [ ] #3 Planner procedure stays two-way (evidence vs no evidence — record it): it does not distinguish failed from unbound and does not block on any capability state (D-021)
- [ ] #4 No concrete analyzer name, provider name, or runnable command appears anywhere in `bundled/coding/prompts/planner.md`
- [ ] #5 `tests/prompts/analysis-procedures.test.ts` contains a test named `expresses planner investigation in capability terms` carrying marker `@cosmo-behavior plan:analysis-investigation-procedures#B-019`, which pins the operative sentence of each obligation above rather than bare tokens, and asserts the absence of any provider name across the whole prompt
- [ ] #6 Every pre-existing assertion in `tests/prompts/analysis-procedures.test.ts` still passes unchanged, and no existing test is deleted, renamed, or weakened
- [ ] #7 The project test, lint, and type-check steps pass
<!-- AC:END -->
