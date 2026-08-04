---
id: TASK-543
title: Fallow adapter derives declared coverage from the real invocation
status: Done
priority: high
labels:
  - 'plan:analysis-gate-coverage'
  - backend
dependencies:
  - TASK-542
createdAt: '2026-07-31T15:45:17.720Z'
updatedAt: '2026-07-31T16:05:09.288Z'
---

## Description

Stage 2 of `missions/plans/analysis-gate-coverage/plan.md`.
Implements B-041 (sources AC-013, AC-014).

The Fallow adapter must declare the coverage it actually produced, derived
from the invocation performed rather than from a per-kind constant. A
hardcoded coverage list is indistinguishable from a correct one until a
provider changes — prove the derivation against the captured 2.54.2
envelopes in `tests/fixtures/fallow-2.54.2/`, not hand-written fixtures.

Derivation rule (D-031, human-decided 2026-07-31):

- `duplication` → duplication; `complexity` → complexity;
  `boundary-conformance` → boundary-conformance; `dead-code` → dead-code.
- `changed-scope-audit` → the categories whose sub-envelopes were actually
  present and normalized (`dead_code`, `duplication`, `complexity`).
- The dead-code family — the `dead-code` capability path and the audit's
  `dead_code` envelope — additionally declares `boundary-conformance`
  exactly when the provider reports boundary zones and rules configured.
  That is the same condition detection already uses to advertise the
  capability as `supported` rather than `provider-not-configured`
  (`boundariesConfigured` at `fallow-provider.ts:823`).

Why the extra category is required: `normalizeDeadCodeFindings` maps the
`boundary_violations` collection to `boundary-conformance` findings in both
the `dead-code` and audit paths (`fallow-provider.ts:1606-1609`). Without
D-031, a project with configured zones would turn a legitimate provider
result into a B-042 contradiction failure and break two working
capabilities. Declaring it unconditionally was rejected too: with no zones
configured nothing about boundaries was evaluated, so the declaration would
assert coverage the run never produced.

The configured-boundary signal has to reach execution — `FallowExecutionRuntime`
(`fallow-provider.ts:1432`) currently carries no config. Plumb the signal
through; do not re-derive coverage from the findings themselves (deriving
coverage from findings makes the B-042 contradiction check vacuous and is
the inference D-029 rejected) and do not hardcode it.

Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
Test: `tests/extensions/project-tools-fallow-fixtures.test.ts` >
`derives declared gate coverage from real provider envelopes`
Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-041`

Record the commit SHA at task start; that SHA is the changed-scope base for
any audit run at task close. Ratified ground: INV-1..INV-5, D-013, D-024,
D-025, D-029, D-030, D-031. Do not change which capabilities Fallow
supports, add a second provider, or change the gate vocabulary.

<!-- AC:BEGIN -->
- [x] #1 Declared coverage on every completed Fallow verdict-bearing result is derived from the invocation actually performed, not from a per-result-kind constant
- [x] #2 A single-capability result declares its own capability, and a changed-scope audit declares exactly the categories whose provider sub-envelopes were present and normalized
- [x] #3 The dead-code family declares `boundary-conformance` in addition to its nominal categories exactly when the provider reports boundary zones and rules configured, and omits it otherwise (D-031)
- [x] #4 The configured-boundary signal reaches normalization through the provider execution runtime rather than being hardcoded or re-derived from the normalized findings
- [x] #5 Declared coverage is non-empty and free of duplicate entries on every completed verdict-bearing Fallow result
- [x] #6 `tests/extensions/project-tools-fallow-fixtures.test.ts` asserts declared coverage for each verdict-bearing capability against the captured `tests/fixtures/fallow-2.54.2/` envelopes, covering both the boundary-configured and boundary-unconfigured dead-code cases, in a test named `derives declared gate coverage from real provider envelopes` carrying marker `@cosmo-behavior plan:analysis-gate-coverage#B-041`
- [x] #7 The project test, lint, and type-check steps pass, and no existing test is deleted or rewritten to make the change green
<!-- AC:END -->
