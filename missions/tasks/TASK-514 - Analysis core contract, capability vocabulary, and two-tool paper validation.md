---
id: TASK-514
title: 'Analysis core contract, capability vocabulary, and two-tool paper validation'
status: Done
priority: high
labels:
  - 'plan:analysis-capability-runtime'
  - backend
dependencies:
  - TASK-513
createdAt: '2026-07-29T16:40:48.856Z'
updatedAt: '2026-07-29T17:17:10.294Z'
---

## Description

Stage 2 of `missions/plans/analysis-capability-runtime/plan.md`. Freeze the
contract two sibling plans will consume: `analysis-gate-rewiring` and
`analysis-investigation-procedures` are written against what lands here.

Read Design §1 and decisions D-003, D-004, D-009, D-013, D-016 first. The
captured envelopes from the pin task are the evidence for what the provider
actually returns — validate the paper mappings against them before
promoting any field to generic.

Ratified ground: AC-001 and AC-002 are spec criteria and D-013 is ratified
— a per-result-kind verdict is settled, and trace and fix-preview return
`verdict: "not-applicable"`. Do not reopen either without a human decision;
route collisions through the deviation classifier.

Gate kinds: `correctness` (hard fail) and `artifact-conformance` (hard
fail). Record the commit HEAD at task start; that SHA is the changed-scope
base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 `B-001` — the capability documentation states one vocabulary of exactly the seven capability names; the four gate-facing names match the gate-contracts vocabulary exactly and the three operational capabilities introduce no competing gate alias.
- [x] #2 `B-002` — the validation record maps every generic result field to at least two real tools with no more than one being the reference provider, provider-tags every single-provider aspect, and covers all seven capabilities.
- [x] #3 The analysis core expresses the contract: discriminated capability, scope, binding, and result types; verdict per result kind (`D-013`, ratified); and the `failed` binding state distinct from unbound (`D-009`).
- [x] #4 The core imports neither Pi nor concrete provider code (`D-004`).
- [x] #5 Any generic field the validation record cannot map to two real tools moves under a provider tag before the schema is frozen (`INV-4`).
- [x] #6 Tests carry `@cosmo-behavior plan:analysis-capability-runtime#B-001` and `#B-002` near the executable test, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
