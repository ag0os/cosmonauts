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

- **D-031 - Declared coverage is derived from the invocation, including the boundary category the dead-code family can emit** *(superseded by D-032, 2026-08-03)*
  - Decision: a provider path declares every gate category that invocation actually evaluated, not the nominal capability alone. For Fallow, the `dead-code` path and the audit's `dead_code` envelope declare `boundary-conformance` in addition to their nominal categories **only when the provider reports boundary zones and rules configured** — the same condition under which detection advertises `boundary-conformance` as supported rather than `provider-not-configured`. `duplication`, `complexity`, and `boundary-conformance` paths declare exactly their own category.
  - Supersedes: B-041's Expected enumeration, which read that the audit declares dead-code, duplication, and complexity and that a single-capability result declares exactly its own capability.
  - Alternatives: keep the superseded enumeration literally (rejected — `normalizeDeadCodeFindings` maps the `boundary_violations` collection to `boundary-conformance` findings in both the `dead-code` and audit paths, so any project with configured zones would turn a legitimate provider result into a B-042 contradiction failure, breaking two working capabilities); always declare `boundary-conformance` for the dead-code family regardless of configuration (rejected — with no zones configured nothing about boundaries was evaluated, so the declaration would assert coverage the run never produced, which is the fabrication this plan exists to prevent); drop or re-category the boundary findings emitted by the dead-code path (rejected — B-042 forbids reconciling a contradiction by dropping a finding, and re-categorizing changes the gate vocabulary this plan excludes).
  - Why: serves INV-2 (a category is declared covered only when it was genuinely evaluated, so nothing reads as passed by default) and INV-3 (the contradiction check stays a real invariant — a boundary finding with no configured zones remains an error rather than being absorbed by a permanently widened coverage list). D-030's uniform-presence rule is preserved: coverage is still required and non-empty on every verdict-bearing result.
  - Decided by: human, user-chose-among-options, 2026-07-31

- **D-032 - Boundary coverage is derived from finding evidence, not from the resolved configuration**
  - Decision: a dead-code-family invocation declares `boundary-conformance` exactly when that invocation produced at least one boundary finding. A finding is itself proof the category was evaluated, so the claim is always backed by evidence carried in the same envelope. A clean run declares nothing for the category. `duplication`, `complexity`, and the dedicated `boundary-conformance` path continue to declare exactly their own category, and the audit continues to declare the categories whose sub-envelopes it normalized.
  - Supersedes: D-031, and with it B-041's configuration-conditioned Expected.
  - Alternatives: keep D-031's configuration condition and accept the residuals (rejected — the condition cannot be evaluated soundly: Fallow resolves `extends` from relative paths, `npm:` packages, and `https://` URLs and also reads configuration from package.json, an escaped key such as `"extends"` defeats any local token probe, and a separate configuration process can never be atomic with the capability process, so the claim can be wrong in the over-declaring direction); fail closed whenever the configuration closure is not locally verifiable (rejected — disables `analysis_dead_code`, `analysis_audit`, and `analysis_boundaries` outright for projects using a documented, legitimate Fallow configuration style, including the Quality Manager's own gate path); withhold the category when the closure is unverifiable without failing (rejected as unsound — boundaries may still be configured, so the resulting boundary findings would contradict the withheld coverage and fail normalization under B-042, turning legitimate provider output into an error).
  - Why: serves INV-2 and INV-3 more strongly than D-031 did. Coverage becomes unforgeable by a stale or externally inherited configuration because it no longer consults configuration at all, and it under-declares rather than over-declares on a clean run — the gate degrades visibly instead of passing without evidence. Nothing is lost at the consumer: `bundled/coding/prompts/quality-manager.md` resolves a bound `boundary-conformance` row by calling its own capability, never from the changed-scope audit, so no consumer reads the claim this withholds. D-030's uniform-presence rule is preserved.
  - Consequence recorded honestly: the reference adapter's normalizers can no longer construct a finding outside declared coverage, because every category they emit is derived from the same evidence that declares it. B-042's failure path still exists and is proven directly at its seam, but is unreachable from the reference provider by construction.
  - Decided by: human, user-chose-among-options, 2026-08-03

- **D-033 - Stale detection caching for externally inherited configuration is out of scope**
  - Decision: record, and do not fix here, that discovery caches capability bindings: if an external configuration source removes boundary zones mid-session, `analysis_boundaries` remains bound and returns a clean result for rules that no longer exist. The local-configuration case is already covered by the configuration-identity check, which fails closed on any change to a canonical signal file.
  - Alternatives: extend configuration-identity invalidation to the dedicated boundary capability for externally inherited configuration (rejected for this plan — the root cause is detection-cache staleness delivered by `analysis-capability-runtime`, not the coverage contract this corrective plan owns, and it carries the same unsolvable cross-process atomicity problem that D-032 turned away from).
  - Why: keeps this corrective plan narrow, consistent with the ratified three-way slice split recorded on the parent design. Surfaced by independent review, which noted this plan makes a bound gate reachable for the first time and so converts a latent staleness bug into a reachable one — that is the reason it is recorded rather than left silent.
  - Decided by: human, user-chose-among-options, 2026-08-03

- **D-034 - A gate capability whose contributing rules are all disabled is reported unbound**
  - Decision: a gate capability is advertised as supported only when the provider will actually evaluate it. `boundary-conformance` additionally requires the `boundary-violation` severity not be `off`; `dead-code` requires at least one of its contributing rules to remain enabled. Otherwise the capability is reported unbound with `provider-not-configured` and is never executed. Either documented spelling of a rule key (plural `unused-files`, singular `unused-file`) counts as evidence that the rule is disabled, because over-detecting "disabled" degrades a gate visibly while under-detecting it would leave a capability bound and could pass a gate the provider never evaluated.
  - Alternatives: keep requiring only non-empty zones and rules (rejected — the provider then reports nothing whatever the code contains, so a clean single-capability result would declare `boundary-conformance` covered under D-030 and a bound gate could pass on an evaluation that never happened); declare the capability bound but withhold coverage from its own result (rejected — it contradicts D-030's uniform-presence rule and leaves a bound gate with no classifiable verdict, which INV-3 makes an error rather than a quiet degradation).
  - Why: serves INV-2 directly — an unsupported capability is reported unbound and skipped openly rather than silently passed. Surfaced by independent review across two rounds, on the one class of path the evidence rule cannot protect: a single-capability result declares its own capability by construction, so over-declaration there has to be prevented at the binding, not at normalization. `dead-code` matters most because it is a bound row in this plan's own Quality Contract. Unlike the staleness recorded separately, this is static local configuration the adapter already reads at discovery, so it is verifiable without any cross-process assumption.
  - Decided by: implementer, amend-on-record, 2026-08-03
  - Note: narrows when the reference provider advertises one capability. It does not change the capability vocabulary or which capabilities the provider supports, so it stays inside this plan's stated exclusions.

- **D-035 - Per-path rule overrides are a recorded boundary, not a partial check**
  - Decision: the disabled-rule determination reads top-level rule severities only. A configuration that leaves a rule enabled globally and disables it through a per-path `overrides` entry matching the analyzed scope is not detected, and the capability stays bound. Record the boundary in the delivered documentation rather than implementing a partial check.
  - Alternatives: match override globs against the analyzed scope in general (rejected — the adapter does not know which files the provider will analyze until after it runs, so this needs glob semantics plus a scope intersection the provider alone can compute); unbind whenever any override mentions a contributing rule (rejected — an override narrowing one rule for test files is ordinary configuration, so this would degrade the gate for most real projects and train operators to ignore the signal); detect the bounded subset — a final override whose `files` is the provider's universal glob and which disables every file-scoped contributing rule (**not rejected as unsound**: independent review established it is decidable without computing the analyzed scope, because the provider applies matching overrides in order, so a final universal override determines the outcome for every possible path. It is deferred rather than dismissed: it closes one recognizable spelling of a scope-wide disable while leaving every equivalent one — a union of globs covering the same scope, a non-final universal override, a different but total pattern — undetected, so it narrows the residual without changing its character).
  - Why: the same reasoning that settled the boundary-coverage question. Where a property cannot be verified reliably, surface the boundary and record it rather than shipping a check that looks complete. The residual is narrower than the cases already closed: it requires a configuration that deliberately disables analysis for the whole analyzed scope while appearing enabled globally. The honest statement is that the general problem is undecidable here and the recognizable special case buys little — not that no bounded check exists.
  - Consequence: audit coverage is additionally protected by evidence — a dead-code finding declares the category whatever the configuration says — so the residual is confined to a clean result under a scope-wide override.
  - Decided by: implementer, amend-on-record, 2026-08-03

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
- Expected: declared coverage is derived from the invocation actually performed and matches the captured 2.54.2 envelopes; the audit declares the categories whose sub-envelopes it normalized, a single-capability result declares its own capability, and the dead-code family additionally declares boundary-conformance exactly when that invocation produced a boundary finding (D-030, D-032) *(Expected amended by D-031, 2026-07-31, then again by D-032, 2026-08-03, which supersedes D-031's configuration condition; both superseded readings are recorded as rejected alternatives there)*
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
constant. The audit path declares the categories whose sub-envelopes it
normalized; each single-capability path declares its own; and the dead-code
family declares `boundary-conformance` exactly when that invocation produced a
boundary finding, which is itself the evidence the category was evaluated
(D-032, superseding D-031's configuration condition). No configuration is
consulted, so the claim cannot be forged by a stale or externally inherited
configuration. Coverage is cross-checked against the
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
  produce. B-042's contradiction check catches only under-declaration — a
  finding whose category the result did not declare. Over-declaration with no
  findings is indistinguishable from a clean evaluation at that seam, so it is
  prevented upstream instead: each declaration is derived from evidence in the
  invocation's own envelope, and a capability the provider will not evaluate is
  reported unbound rather than executed.
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
