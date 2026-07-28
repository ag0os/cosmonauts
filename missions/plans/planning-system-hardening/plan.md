---
title: Planning system hardening
status: active
createdAt: '2026-07-28T17:19:32.018Z'
updatedAt: '2026-07-28T17:19:32.018Z'
---

## Overview

Upstream the mechanical defect categories observed in the 2026-07-27
`analysis-capabilities` planning run into the layers that can catch them
cheaply: five authoring-time rules in the planner prompt, three recall
mechanisms in the plan-reviewer prompt, versioned review rounds so evidence
chains resolve forever, and an extended mechanical conformance check. No agent
configuration changes; no new review layers. Spec: `spec.md` (Intent
INV-1..INV-4 ratified).

## Current State

- `bundled/coding/prompts/planner.md` (85 lines) has design/stress checklists
  but no closing consistency pass, state-space rule, enforced size checkpoint,
  test-provability rule, or trust line.
- `bundled/coding/prompts/plan-reviewer.md` (197 lines) defines ten dimensions
  and a findings format, writes to a fixed `missions/plans/<slug>/review.md`
  (line 144), and has no coverage ledger, live-probe instruction, or
  scope/size dimension. Each round overwrites the last — the
  `analysis-capabilities` plan's D-008/D-012 already cite a vanished round.
- `lib/artifacts/behavior-conformance.ts` checks required behavior fields,
  root-relative test files, and marker presence; surfaced by
  `cosmonauts plan check-artifacts <slug>`
  (`cli/plans/commands/check-artifacts.ts`). It has no concept of decision
  citations, supersession pointers, Files-to-Change pairing, marker
  uniqueness, withdrawn behaviors, or size advisories. The
  `analysis-capabilities` plan carries two withdrawn behaviors (B-020/B-032)
  the checker cannot classify.
- Content tests exist at `tests/prompts/planner.test.ts` and
  `tests/prompts/plan-reviewer.test.ts`; checker tests at
  `tests/artifacts/behavior-conformance.test.ts`; CLI tests at
  `tests/cli/plans/subcommand.test.ts`.

## Decision Log

- **D-001 - Scope: prompts, round versioning, and lint — nothing else**
  - Decision: harden the two prompts, version the review artifact, extend the
    single mechanical checker. No model/thinking/tool configuration changes;
    no new review layers or orchestration; the multi-lens adjudication
    pattern remains an on-demand practice.
  - Alternatives: shipping a standing multi-lens review workflow (expensive
    default for routine plans); reviewer model/config changes (the evidence
    run validated current configuration).
  - Why: the evidence run showed ~70% of third-layer findings were mechanical
    categories; upstreaming them is cheaper than institutionalizing more
    review.
  - Decided by: human (accepted recommendation), 2026-07-28

- **D-002 - Review rounds are `review-<n>.md`, next free number; legacy `review.md` is round 1**
  - Decision: the reviewer writes findings to the lowest unused
    `review-<n>.md` (n ≥ 1) in the plan directory and never overwrites an
    existing round. A legacy `review.md` is read as round 1 and counts when
    allocating the next number. The planner's revision pass reads every round
    and cites findings round-qualified (`review-2.md PR-003`).
  - Alternatives: appending rounds inside one file (merge-conflict-prone,
    breaks existing line citations); timestamped filenames (harder to cite).
  - Why: INV-3 — the `analysis-capabilities` stale-citation defect was caused
    by overwriting, not by either agent misbehaving.
  - Decided by: planner-proposed, 2026-07-28

- **D-003 - Lint additions land in `checkBehaviorConformance` as issue kinds plus an advisory list**
  - Decision: extend the existing checker with new issue kinds — unresolved
    decision citation, undated supersession pointer, behavior seam/test file
    missing from Files to Change, duplicate marker — plus a non-blocking
    advisory channel (behavior count beyond guidance). Withdrawn behaviors
    are detected by the `*(withdrawn` annotation on the behavior heading,
    excluded from required-test checks, and reported as withdrawn. No
    parallel checker.
  - Alternatives: a separate plan-lint command (splits the conformance story
    the artifact-conformance gate depends on); blocking on size (violates
    INV-4 — size is judgment-adjacent, so it stays advisory).
  - Why: one mechanical seam, one gate; the extended checks are pure
    structure per INV-4.
  - Decided by: planner-proposed, 2026-07-28

- **D-004 - Prompt edits are additive and preserve the existing report contract**
  - Decision: planner and reviewer edits add rules and sections without
    renaming existing dimensions, checklists, or the findings format; the
    coverage ledger is a new required section appended to the findings
    report. All added text stays stack-agnostic.
  - Alternatives: restructuring the reviewer's dimension list (churns
    existing content tests and retrains nothing).
  - Why: minimize regression surface in two prompts that demonstrably work.
  - Decided by: planner-proposed, 2026-07-28

## Behaviors

### B-001 - Planner runs a closing consistency pass
- Source: AC-001
- Context: the planner prompt's workflow before presenting or handing a plan to review
- Action: the prompt text is inspected
- Expected: the prompt instructs a closing consistency pass — every decision entry walked against the design text and behaviors it governs, and the implementation order walked for intermediate states where a shipped artifact references a seam that no longer exists — before the plan is presented or reviewed
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `requires a closing consistency pass over decisions and stage ordering`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-001`

### B-002 - Planner enumerates state spaces
- Source: AC-002
- Context: the planner prompt's design guidance
- Action: the prompt text is inspected
- Expected: the prompt instructs that any design introducing states, bindings, or classifications enumerates inputs × states with a defined outcome for every cell, and names "no implementer-decided cells" as the standard
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `requires state-space enumeration with no implementer-decided cells`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-002`

### B-003 - Planner size checkpoint forces slices or justification
- Source: AC-003
- Context: the planner prompt's scoping guidance
- Action: the prompt text is inspected
- Expected: the prompt instructs that a plan past the project's size guidance must carry explicit slice boundaries in the Implementation Order or a recorded justification, and states that acknowledging size in prose without resolving it is insufficient
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `enforces the size checkpoint with slice boundaries or justification`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-003`

### B-004 - Planner phrases Expected clauses as test-provable
- Source: AC-004
- Context: the planner prompt's behavior-writing guidance
- Action: the prompt text is inspected
- Expected: the prompt instructs that each behavior's Expected clause states what its named test can actually assert, and that behaviors proven by content tests state text obligations, not runtime outcomes
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `requires expected clauses provable by the named test`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-004`

### B-005 - Planner names trust boundaries for project-controlled execution
- Source: AC-005
- Context: the planner prompt's design/stress checklist
- Action: the prompt text is inspected
- Expected: the prompt instructs that a design executing anything project-controlled must name the trust boundary and the consent gate
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `requires naming trust boundary and consent gate for project-controlled execution`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-005`

### B-006 - Reviewer report carries a coverage ledger
- Source: AC-006
- Context: the plan-reviewer prompt's findings format
- Action: the prompt text is inspected
- Expected: the prompt requires a coverage ledger section listing every review dimension with what was checked and either findings or an explicit none, and requires unchecked dimensions to be declared unchecked
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `requires a per-dimension coverage ledger with explicit none`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-006`

### B-007 - Reviewer probes external tools live
- Source: AC-007
- Context: the plan-reviewer prompt's verification methods
- Action: the prompt text is inspected
- Expected: the prompt instructs that when the plan wraps an external tool, the reviewer verifies exit codes, output envelopes, and claimed flags with live read-only invocations where the tool is available, rather than trusting documentation
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `requires live read-only probing of wrapped external tools`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-007`

### B-008 - Reviewer applies the scope and size dimension
- Source: AC-008
- Context: the plan-reviewer prompt's review dimensions
- Action: the prompt text is inspected
- Expected: a scope/size dimension exists that applies the project's plan-size guidance and requires proposing split seams when the plan exceeds it
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `defines a scope and size dimension applying the plan guidance`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-008`

### B-009 - Reviewer writes versioned rounds and never overwrites
- Source: AC-009
- Context: the plan-reviewer prompt's output contract
- Action: the prompt text is inspected
- Expected: the prompt instructs writing findings to the lowest unused `review-<n>.md`, treating a legacy `review.md` as round 1 when allocating, and forbids overwriting any existing round file
- Seam: `bundled/coding/prompts/plan-reviewer.md`
- Test: `tests/prompts/plan-reviewer.test.ts` > `writes findings to the next free round file and never overwrites`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-009`

### B-010 - Planner reads all rounds and cites round-qualified
- Source: AC-009
- Context: the planner prompt's revision-pass instructions
- Action: the prompt text is inspected
- Expected: the prompt instructs reading every review round (including legacy `review.md` as round 1), citing findings round-qualified in decision entries, and treating the latest round as the revision driver
- Seam: `bundled/coding/prompts/planner.md`
- Test: `tests/prompts/planner.test.ts` > `reads all review rounds and cites findings round-qualified`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-010`

### B-011 - Checker resolves decision citations and supersession pointers
- Source: AC-010
- Context: a plan body citing `D-###` entries, including one unresolved citation and one undated supersession pointer
- Action: `checkBehaviorConformance` runs
- Expected: an unresolved `D-###` citation and an undated supersession pointer each produce a distinct issue; resolved, dated entries produce none
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `flags unresolved decision citations and undated supersession pointers`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-011`

### B-012 - Checker verifies pairing, marker uniqueness, withdrawn status, and size advisory
- Source: AC-010
- Context: a plan with a behavior seam/test file absent from Files to Change, a duplicated marker, a `*(withdrawn` behavior, and a behavior count past the guidance
- Action: `checkBehaviorConformance` runs and the CLI renders the result
- Expected: pairing gaps and duplicate markers are issues; the withdrawn behavior is excluded from required-test checks and reported withdrawn; the size signal is rendered as a visibly advisory item, not an error, in json/plain/human output
- Seam: `lib/artifacts/behavior-conformance.ts`, `cli/plans/commands/check-artifacts.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `checks pairing, marker uniqueness, withdrawn behaviors, and size advisory`; CLI case in `tests/cli/plans/subcommand.test.ts`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-012`

### B-013 - The in-flight capabilities plan passes the extended checker
- Source: AC-009, AC-010
- Context: the real `missions/plans/analysis-capabilities/` artifacts on disk (legacy `review.md`, withdrawn B-020/B-032)
- Action: the extended checker runs against that slug
- Expected: no new blocking issues are introduced by this plan's checker extensions — withdrawn behaviors classify as withdrawn, the legacy round is readable — proving backward compatibility on live artifacts
- Seam: `lib/artifacts/behavior-conformance.ts`
- Test: `tests/artifacts/behavior-conformance.test.ts` > `keeps the analysis-capabilities artifacts passing under extended checks`
- Marker: `@cosmo-behavior plan:planning-system-hardening#B-013`

## Design

### 1. Checker extensions (`lib/artifacts/behavior-conformance.ts`)

Add issue kinds: `unresolved-decision-citation`, `undated-supersession`,
`unpaired-behavior-file`, `duplicate-marker`. Add a parallel non-blocking
`advisories` array on `ArtifactConformanceResult` (currently: behavior count
beyond guidance). Parse decision entries (`- **D-### -`) and citations
(`D-###` tokens in body text) from the plan body already loaded by
`loadPlanArtifact`; supersession pointers are `Supersedes:` lines and
`*(superseded by D-###, <date>)*` / `*(withdrawn by D-###, <date>)*`
annotations — the dated form is required. Withdrawn behaviors are headings
matching `*(withdrawn` — exclude from required-field/test issues, count them
in a `withdrawn` result field. Pairing: each behavior's Seam and Test files
must appear somewhere in the `## Files to Change` section when that section
exists; absence of the section skips the check (small plans). CLI rendering
gains an advisories block in all three formats.

### 2. Round versioning (prompts only)

No `lib/` code reads `review.md` — the contract lives in the two prompts.
`plan-reviewer.md` line 144's fixed path becomes the D-002 allocation rule;
`planner.md` lines 61 and 67 become round-aware (read all rounds, latest
drives revision, citations round-qualified). This retroactively legitimizes
the `analysis-capabilities` decision-log annotations.

### 3. Prompt hardening

Planner (five additions, D-004 additive): consistency pass appended to the
workflow as a numbered closing step; state-space rule and trust line added to
the design checklist; size checkpoint added to scoping guidance; provability
rule added where behavior format is described. Reviewer (three additions):
scope/size becomes dimension 11; live-probe instruction joins the
verification-methods preamble; coverage ledger becomes a required section in
the findings format after `## Missing Coverage`.

## Files to Change

- `tests/prompts/planner.test.ts` ↔ `bundled/coding/prompts/planner.md` (B-001..B-005, B-010).
- `tests/prompts/plan-reviewer.test.ts` ↔ `bundled/coding/prompts/plan-reviewer.md` (B-006..B-009).
- `tests/artifacts/behavior-conformance.test.ts` ↔ `lib/artifacts/behavior-conformance.ts` (B-011..B-013).
- `tests/cli/plans/subcommand.test.ts` ↔ `cli/plans/commands/check-artifacts.ts` (B-012 rendering).

## Quality Contract

| Order | Gate kind | Tier | Binding state | Threshold | Protocol | Degradation / notes |
|---:|---|---|---|---|---|---|
| 1 | `correctness` | universal | bound | project-native test, lint, and type-check steps pass | project-discovered | hard fail |
| 2 | `artifact-conformance` | universal | bound | every B-001–B-013 entry has its named test and exact marker | artifact evidence | hard fail |

## Implementation Order

1. **RED B-011/B-012/B-013: checker extensions.** Land the new issue kinds,
   advisories, withdrawn handling, and CLI rendering against fixtures plus
   the live `analysis-capabilities` artifacts. This first — it mechanically
   guards the prompt work that follows.
2. **RED B-009/B-010: round versioning.** Both prompts' round contracts and
   content tests.
3. **RED B-001..B-005: planner hardening.** Five additive rules with content
   tests.
4. **RED B-006..B-008: reviewer hardening.** Ledger, live probe, scope
   dimension with content tests.
5. **Full gates.** Test, lint, type-check; `check-artifacts` on this plan and
   on `analysis-capabilities`; stack-agnostic scan of both prompt diffs.

## Risks

- **Prompt bloat.** planner.md is deliberately lean (85 lines); additions are
  rules, not essays — each new instruction is one to three sentences, and the
  content tests pin the load-bearing phrases only.
- **Annotation grammar fragility.** Withdrawn/supersession detection depends
  on the exact `*(withdrawn by D-###, <date>)*` shape; the checker pins the
  grammar and B-013 proves it against real artifacts, so drift fails visibly.
- **False positives on legacy plans.** New issue kinds run only on plans that
  use the corresponding structures (decision log, Files to Change); their
  absence skips the check rather than failing it.
- **Round allocation race.** Single-writer per plan directory is assumed (one
  reviewer at a time); the next-free-number rule makes a collision loud (file
  exists), not silent.
