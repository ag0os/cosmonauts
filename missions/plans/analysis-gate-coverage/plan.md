---
title: Analysis gate coverage
status: active
createdAt: '2026-07-30T00:00:00.000Z'
updatedAt: '2026-07-30T00:00:00.000Z'
---

## Overview

Corrective plan for D-029: the `changed-scope-audit` result contract cannot
express which gate categories it evaluated, so its first consumer — the Quality
Manager rewired by `analysis-gate-rewiring` — can never resolve a bound gate to
`pass` and can never reach sign-off.

The end state is:

- A completed verdict-bearing result declares its evaluated gate capabilities in
  the existing generic vocabulary.
- The Fallow adapter declares the coverage it actually produces, derived from
  real envelopes rather than assumed.
- A finding outside declared coverage is a normalization failure, not a result.
- The Quality Manager resolves a bound gate to `pass` only for declared-covered
  categories, and reports the rest as degraded or failed-to-run.

What this plan does not do: change the capability vocabulary, change which
capabilities the reference provider supports, add a second provider, or touch
slice 3's role procedures. INV-3 and INV-5 outrank every convenience below.

## Decision Log

This plan is corrective rather than a fourth slice, so it does not restate the
parent design's full log. The decisions made on the parent design and its first
slice remain in force and live on `missions/archive/plans/analysis-capability-runtime/plan.md`
and `missions/plans/analysis-gate-rewiring/plan.md`. Only the entries this plan
depends on directly are carried below, plus the two it decides itself. Behaviors
cite this plan's own AC-013 through AC-017.

- **D-013 - Discriminate verdict by result kind** *(ratified; carried verbatim in substance from the parent design because this plan's contract change must not disturb it)*
  - Decision: analysis-kind results (`dead-code`, `duplication`, `complexity`, `boundary-conformance`, `changed-scope-audit`) carry an asserted or derived verdict; operational results (`trace`, `fix-preview`) carry `verdict: "not-applicable"` plus their evidence/proposals.
  - Why: carried here because the coverage member added by this plan attaches to verdict-bearing results only. Extending coverage to `trace` or `fix-preview` would reintroduce the fabricated-meaning problem this ratified entry closed.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27; ratified by human, 2026-07-29

- **D-020 - Failure evidence is structured prose, not a canonical-JSON round-trip contract** *(carried from the first slice because this plan raises a new failure)*
  - Decision: a thrown `AnalysisProviderError` message names capability, provider, failure class, and process evidence.
  - Why: carried here because B-042 raises a new provider failure for coverage contradictions and must use the established evidence shape rather than inventing a second one.
  - Decided by: review-synthesis agent, amend-on-record, 2026-07-27

- **D-029 - The delivered result contract cannot express gate coverage** *(recorded on the archived `analysis-capability-runtime` plan; this plan owns the fix)*
  - Decision: add a coverage member to the completed verdict-bearing result rather than inferring coverage from findings, reading the provider payload, or relaxing the consumer.
  - Alternatives: infer from absence of findings (an unevaluated category becomes a pass — the silent pass INV-2 forbids); read native payload (provider coupling in a generic consumer — INV-1/INV-4); relax the consumer to pass every bound gate on an aggregate `pass` (same silent pass, and INV-3 requires an unclassifiable result to be an error).
  - Why: discovered by independent codex review of slice 2. The consumer is correct on both counts that create the deadlock — refusing native fields (INV-1) and reporting an unclassifiable gate as failed-to-run (INV-3) — so the contract is what must move.
  - Decided by: human, user-chose-among-options, 2026-07-30

- **D-030 - Declare coverage explicitly on every verdict-bearing result, including single-capability results**
  - Decision: the coverage member is present on every verdict-bearing result, not only `changed-scope-audit`. A single-capability result declares the one capability it evaluated.
  - Alternatives: coverage only on the audit result (leaves single-capability coverage implicit, which is the same defect one layer down and would let a future adapter return a `dead-code` result that evaluated nothing); a separate optional member (an optional coverage field is indistinguishable from missing coverage at the consumer, recreating the gap).
  - Why: settles the spec's Open Question. Uniform presence makes the consumer rule uniform and makes fabricating coverage a type error rather than a convention.
  - Decided by: planner-proposed, 2026-07-30

## Behaviors

Numbered from B-040 to stay clear of the parent design's B-001–B-037 family.

### B-040 - Completed results declare evaluated gate coverage
- Source: AC-013
- Context: a verdict-bearing capability completes
- Action: the runtime normalizes the provider result
- Expected: the completed result carries a non-empty coverage member listing evaluated gate capabilities drawn from the existing vocabulary, with no new gate name and no provider-specific member; the type makes an absent coverage member a compile error
- Seam: `lib/analysis/types.ts`
- Test: `tests/analysis/contracts.test.ts` > `declares evaluated gate coverage on every verdict bearing result`
- Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-040`

### B-041 - The reference adapter declares the coverage it actually produced
- Source: AC-013, AC-014
- Context: the Fallow adapter normalizes a changed-scope audit and each single-capability result
- Action: it builds the completed result
- Expected: declared coverage is derived from the invocation actually performed and matches the captured 2.54.2 envelopes; the audit declares dead-code, duplication, and complexity, and a single-capability result declares exactly its own capability (D-030)
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow-fixtures.test.ts` > `derives declared gate coverage from real provider envelopes`
- Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-041`

### B-042 - Findings outside declared coverage are a failure
- Source: AC-015
- Context: a provider result contains a finding whose category is outside the declared coverage
- Action: the adapter normalizes it
- Expected: normalization raises an `AnalysisFailure` preserving the evidence; the contradiction is never reconciled by widening coverage or by dropping the finding
- Seam: `domains/shared/extensions/project-tools/fallow-provider.ts`
- Test: `tests/extensions/project-tools-fallow.test.ts` > `rejects findings outside the declared gate coverage`
- Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-042`

### B-043 - Bound gates pass only for declared-covered categories
- Source: AC-016
- Context: Quality Manager resolves bindable gates from a completed audit result
- Action: it classifies each bound gate
- Expected: the prompt instructs resolving a bound gate to `pass` only when the result declares that gate covered and no finding contradicts it; an undeclared category is degraded or failed-to-run and is never passed by absence of findings; the currently unsatisfiable "complete coverage classifiable" wording is replaced
- Seam: `bundled/coding/prompts/quality-manager.md`
- Test: `tests/prompts/quality-manager.test.ts` > `resolves bound gates only from declared coverage`
- Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-043`

### B-044 - The coverage member is validated against two real tools
- Source: AC-014
- Context: the delivered documentation records the paper validation
- Action: the validation record is inspected
- Expected: the coverage member is mapped to at least two real tools, at most one of which is Fallow, in the same form AC-002's record uses; any aspect only one provider can express is provider-tagged rather than generic
- Seam: `docs/analysis-provider-validation.md`
- Test: `tests/analysis/contracts.test.ts` > `records two tool validation for declared gate coverage`
- Marker: `@cosmo-behavior plan:analysis-gate-coverage#B-044`

## Design

### 1. Contract

Add a required coverage member to `AnalysisCompletedResultBase` for
verdict-bearing kinds only — `trace` and `fix-preview` keep
`verdict: "not-applicable"` and gain no coverage, preserving D-013. Encode it as
a non-empty readonly array of the existing `AnalysisGateCapability` union so a
fabricated or empty coverage is a compile error, following slice 1's established
pattern of encoding ratified contracts as types rather than conventions.

### 2. Adapter

The Fallow adapter derives coverage from the invocation it performed, not from a
constant. The audit path declares the three categories it merges; each
single-capability path declares its own. Coverage is cross-checked against the
findings actually normalized: a finding outside coverage raises
`AnalysisProviderError` with the evidence intact (B-042), reusing slice 1's
failure-evidence shape from D-020.

### 3. Consumer

The Quality Manager's gate resolution replaces "only when the result explicitly
represents complete coverage" — currently unsatisfiable — with a declared-coverage
rule: pass a bound gate when coverage declares it and no finding contradicts it;
otherwise degrade or fail-to-run. The exclusive-bucket rule and the
boundary-conformance resolution added by `analysis-gate-rewiring`'s review
remediation are preserved.

## Files to Change

- `tests/analysis/contracts.test.ts` ↔ `lib/analysis/types.ts`.
- `tests/extensions/project-tools-fallow-fixtures.test.ts` ↔ `domains/shared/extensions/project-tools/fallow-provider.ts`.
- `tests/extensions/project-tools-fallow.test.ts` ↔ `domains/shared/extensions/project-tools/fallow-provider.ts`.
- `tests/prompts/quality-manager.test.ts` ↔ `bundled/coding/prompts/quality-manager.md`.
- `tests/analysis/contracts.test.ts` ↔ `docs/analysis-provider-validation.md`.
- `docs/analysis-capabilities.md` — document that completed verdict-bearing results declare coverage.

## Risks

- **The contract is shipped and pushed.** Adding a required member is a breaking
  change to `lib/analysis/`. The only consumers are in-repo, so the blast radius
  is bounded, but every construction site must be updated in the same change or
  the type-check gate fails loudly — which is the desired failure mode.
- **Coverage could be faked.** An adapter could declare coverage it did not
  produce. B-042's contradiction check is the guard; it is derived from real
  envelopes rather than asserted.
- **The consumer rule can regress into a silent pass.** The whole defect was a
  gate passing without evidence. B-043 must assert the negative — an undeclared
  category is not a pass — not merely that a covered category passes.

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | Project-native tests, style, and type/schema checks pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | Every B-### entry (B-040–B-044; none withdrawn) has its named test and exact marker | artifact evidence | hard fail |
| 3 | `mutation` | bindable | unbound | Project-specific mutation evidence | pending | unbound/not enforced; reviewer judgment required |
| 4 | `duplication` | bindable | bound | Changed scope introduces no blocking clone finding | capability resolution | genuine unbound degrades; failed blocks |
| 5 | `complexity` | bindable | bound | No configured changed-scope metric violation | capability resolution | never treat unsupported as zero |
| 6 | `boundary-conformance` | bindable | unbound | Configured zones have no changed-scope violation | pending configuration | unbound until rules; introspection failure blocks |
| 7 | `dead-code` | bindable | bound | No blocking changed-scope reachability finding and explicit migration searches find no stale references | capability resolution plus explicit search | capability is additive; failed blocks |

Rows 4, 5, and 7 become resolvable for the first time as a result of this plan —
that is the point of it. Expect the ladder's own run to be the first honest
bound-gate resolution in the design.

## Implementation Order

1. **Contract first (B-040).** Add the coverage member and update every
   construction site until the type-check gate is clean. Nothing else can be
   written against it before it exists.
2. **Adapter derives and cross-checks (B-041, B-042).** Derive coverage from the
   real invocation and reject findings outside it, proven against captured
   envelopes rather than hand-written fixtures.
3. **Validation record (B-044).** Map the member to two real tools before the
   consumer depends on it, so INV-4 is established rather than assumed.
4. **Consumer (B-043).** Replace the unsatisfiable wording. Assert the negative
   case, not only the positive.
5. **Run the ladder.** Project-native gates plus artifact conformance, then the
   bound changed-scope gates from an explicit base — which should now resolve.
