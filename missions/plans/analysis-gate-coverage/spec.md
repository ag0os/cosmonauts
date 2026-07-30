# Spec — Analysis gate coverage

Corrective plan for a contract gap in the ratified `analysis-capabilities`
design, recorded as D-029 against the archived `analysis-capability-runtime`.
It is not a fourth slice of D-024's split: the three slices stand, and this plan
repairs the runtime contract slice 1 delivered so slice 2's consumer can work.

## Purpose

`analysis-gate-rewiring` moved the Quality Manager onto the capability surface,
and independent review of that slice proved the surface cannot answer the
question its first consumer must ask.

A completed `changed-scope-audit` result carries one aggregate `verdict` plus
`findings[]` whose `category` is a gate capability. Nothing on the result says
**which** gate categories were evaluated. So a consumer cannot distinguish "this
gate ran and was clean" from "this gate never ran". `docs/analysis-capabilities.md`
promises only "audit changes from an explicit base"; it never states coverage.
The Fallow adapter happens to run dead-code, duplication, and complexity, but
that is an adapter detail, not a provider-neutral guarantee.

The consumer is correct and the contract is wrong. The Quality Manager refuses
to read provider-native fields (INV-1) and reports an unclassifiable gate as
`failed-to-run` rather than guessing (INV-3). Both are right, and together they
mean every bound `duplication`/`complexity`/`dead-code` gate resolves to
`failed-to-run` and sign-off is unreachable — including for this design's own
plans. This plan adds provider-neutral coverage to the completed result so an
aggregate `pass` resolves exactly the gates the provider actually evaluated, and
no others.

## Intent

Ratified ground, carried verbatim from the parent spec. It governs this plan
identically.

Goal: an agent's analysis procedure is expressed once, against capabilities,
and runs unchanged in any project — each capability resolving to a supporting
provider when one exists and degrading to an explicit unbound state when none
does.

Invariants — mechanism yields to these:

- INV-1 — Shipped prompts, skills, and generic artifacts reference
  capabilities, never concrete tool names or commands. Concrete bindings live
  in project configuration and runtime detection. (Runtime-generated status
  and reports may — and should — name the resolved provider and version.)
- INV-2 — Unsupported is visible: a capability with no provider is reported as
  unbound and skipped openly, never silently passed and never silently
  omitted.
- INV-3 — A provider runtime failure (crash, invalid config, missing git base)
  is never presented as a clean result. Analysis findings and tool errors are
  distinct outcomes end to end.
- INV-4 — The capability contract is provider-agnostic: a capability's generic
  schema must be plausible for at least two real tools; anything only one
  provider can express stays provider-tagged, not generic.
- INV-5 — No capability tool mutates the codebase. Mutation proposals are
  preview-only; applying them is a normal, reviewable agent edit.

Where coverage and safety pull against each other, safety wins: INV-3 and
INV-5 outrank capability completeness — a result that cannot be classified
reliably is reported as an error or left unbound rather than guessed at.

## Users

- **Quality Manager** — the blocked consumer. It can resolve a bound gate to
  `pass` only for categories the result proves were evaluated, and continues to
  report anything else as degraded or failed-to-run.
- **Verifier and Fixer** — consume the same completed results and must not
  read a pass for an unevaluated category either.
- **Future provider adapters** — must declare coverage rather than leave it
  implicit, so a second provider cannot silently under-report.
- **Project maintainers (human)** — get a gate ladder that can actually reach
  sign-off, with unevaluated gates visibly degraded rather than silently passed.

## User Experience

**Resolution.** An aggregate `pass` resolves exactly the gate categories the
result declares as covered. A category outside that set is never passed by
absence of findings — it is reported unbound/degraded, or failed-to-run when a
bound gate was expected and no coverage was declared.

**Failure.** A result whose declared coverage contradicts its own findings — a
finding in a category the result says it did not cover — is a normalization
error, not a result. INV-3 governs: the contradiction is reported, never
reconciled by guessing.

**Neutrality.** Coverage is expressed in the generic vocabulary already defined
by the capability taxonomy. It introduces no new gate names and requires no
consumer to read a provider payload.

## Acceptance Criteria

This plan's own criteria. They extend the ratified twelve rather than amending
them; the parent's AC-003 field list gains a coverage member, which is additive
and does not narrow any ratified reading.

- [ ] AC-013 — A completed verdict-bearing result declares which gate
  capabilities it evaluated, in the existing generic capability vocabulary, with
  no new gate names and no provider-specific member.
- [ ] AC-014 — The declared coverage is validated on paper against at least two
  real tools, at most one of which is Fallow, and the validation record is part
  of the delivered documentation (mirroring AC-002's standard).
- [ ] AC-015 — A result whose findings include a category outside its declared
  coverage is an `AnalysisFailure`, never a silently normalized result.
- [ ] AC-016 — Consuming procedures resolve a bound gate to `pass` only when the
  result declares that gate covered; an undeclared category is degraded or
  failed-to-run, never passed by absence of findings.
- [ ] AC-017 — Project gates pass (the test, lint, and type-check steps) and
  every shipped skill/prompt change remains stack-agnostic.

## Scope

Included:

- A coverage member on the completed verdict-bearing result contract in
  `lib/analysis/`.
- The Fallow adapter declaring the coverage it actually produces, per capability
  and per invocation.
- Re-validated envelope fixtures where the declared coverage is derived.
- The paper validation record for the new member (INV-4).
- The Quality Manager clause that consumes coverage, replacing the currently
  unsatisfiable "complete coverage classifiable" wording.

Excluded:

- Any change to the seven capability names or the gate vocabulary.
- Changing which capabilities Fallow supports, or adding a second provider.
- Slice 3 (`analysis-investigation-procedures`) role procedures.
- Re-opening D-013, D-019, D-021, D-024, or D-025.

## Assumptions

- The three-way split (D-024) stands. This plan repairs delivered ground; it
  does not renumber or reopen the slices.
- `analysis-gate-rewiring` has shipped and is merged. Its Quality Manager
  currently cannot resolve a bound gate; that is the defect this plan clears.

## Open Questions

- Whether coverage should also be declared for the single-capability tools
  (`analysis_dead_code` and friends), where it is arguably implied by the
  capability itself. Deciding it explicitly is cheap and avoids a second
  implicit-coverage gap; the plan should settle it rather than leave it.
