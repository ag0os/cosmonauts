# Spec — Planning system hardening

Grounded in the 2026-07-27 `analysis-capabilities` planning run: a planner →
plan-reviewer chain followed by an independent 11-agent multi-lens review and
per-finding adjudication. Every failure mode named here was observed, verified,
and categorized in that run; this spec upstreams the mechanical categories into
the authoring and review layers so adversarial capacity is spent on judgment.

## Purpose

The planning system's architecture is sound — planner designs, an adversarial
reviewer verifies against the codebase, the planner revises. But the evidence
run showed patterned, addressable gaps: the planner authors cross-section
contradictions inside its own artifact, leaves state-machine cells to the
implementer, blows past the project's own plan-size guidance while
acknowledging it rhetorically, writes behaviors whose named tests cannot prove
them, and has no trust/security lens. The reviewer has exceptional precision
(6/6 findings adversarially confirmed) but unaudited recall: an independent
pass found ~19 additional real findings, largely in mechanical categories, and
the reviewer never probed live tool behavior or applied the size guidance it
loads. One tooling defect corrupts evidence: each review round overwrites
`review.md`, so decision-log citations to earlier rounds stop resolving —
exactly the drift the deviation protocol exists to prevent.

This work hardens both prompts, versions the review artifact, and extends the
mechanical plan-conformance check, so the next planning run produces a plan
whose internal consistency, state coverage, size, and provability are enforced
upstream — leaving the adversarial reviewer to spend its budget on genuine
judgment calls.

## Intent

Goal: the categories of defect that mechanical checks or authoring-time
checklists can catch are caught before or during authoring, every review layer
makes its silence explicit, and every recorded evidence pointer resolves
against an artifact on disk for the life of the plan.

Invariants — mechanism yields to these:

- INV-1 — Reviewer precision is not traded for recall: no finding quotas, no
  volume incentives; coverage gaps are reported as explicit
  checked-and-found-nothing statements, never as manufactured findings.
- INV-2 — Silence becomes explicit: a review dimension that was checked and
  yielded nothing says so; a dimension that was not checked says that. No
  silent pass at any layer.
- INV-3 — Evidence chains resolve forever: a citation to a review finding or a
  superseded decision must resolve against an artifact on disk at any later
  date; no revision round may destroy a prior round's record.
- INV-4 — Mechanical checks stay mechanical: the plan lint asserts structure
  (pairing, resolution, uniqueness, counts) and never judgment; advisory
  signals are visibly advisory, not blocking.

Where INV-3 and artifact tidiness pull against each other, INV-3 wins: extra
round files are cheaper than a broken evidence chain.

## Users

- **The planner agent** — gains a closing consistency pass, a state-space
  enumeration rule, an enforced size checkpoint, a test-provability rule, and
  a trust line, so its next plan does not ship the five defect patterns the
  evidence run caught downstream.
- **The plan-reviewer agent** — gains a coverage ledger, a live-probe
  instruction, and a scope/size dimension, converting its precision into
  precision plus auditable recall.
- **The human** — reads review rounds as a preserved sequence, sees at a
  glance what each review checked, and can trust that every decision citation
  in a plan resolves.
- **Downstream agents (task-manager, workers, quality-manager)** — inherit
  plans whose markers, pairings, and citations are mechanically verified
  before task creation.

## User Experience

**Authoring:** before presenting a plan, the planner runs its closing
consistency pass (decisions walked against design text and behaviors; stage
ordering walked for windows that strand shipped artifacts) and states the
result. Plans past the size checkpoint carry slice boundaries in the
Implementation Order. State-machine designs enumerate their cells.

**Review:** the reviewer's report ends with a coverage ledger — one line per
dimension: checked, evidence looked at, findings or explicitly none. Plans
wrapping an external tool get live read-only probes, not documentation trust.
Findings are written to the next free `review-<n>.md`; nothing is overwritten.

**Revision:** the planner reads every round, cites findings round-qualified
(e.g. `review-2.md PR-003`), and its decision-log citations still resolve
years later.

**Conformance:** `cosmonauts plan check-artifacts <slug>` additionally reports
unresolved decision citations, undated supersession pointers, behavior/file
pairing gaps, duplicate markers, withdrawn behaviors (excluded from
required-test checks), and an advisory size signal.

## Acceptance Criteria

- [ ] AC-001 — The planner prompt requires a closing consistency pass before a
  plan is presented or handed to review: every decision entry walked against
  the design text and behaviors it governs, and the implementation order
  walked for intermediate states in which a shipped artifact references a
  seam that no longer exists.
- [ ] AC-002 — The planner prompt requires state-space enumeration for any
  design that introduces states, bindings, or classifications: inputs ×
  states enumerated, every cell given a defined outcome, no
  implementer-decided cells.
- [ ] AC-003 — The planner prompt enforces a size checkpoint: past the
  project's plan-size guidance (behaviors or stages), the plan must either
  carry explicit slice boundaries in the Implementation Order or record an
  explicit justification — acknowledging the concern in prose without
  resolving it is named as insufficient.
- [ ] AC-004 — The planner prompt requires each behavior's Expected clause to
  be phrased as what its named test can actually assert; behaviors tested by
  content tests state text obligations, not runtime outcomes.
- [ ] AC-005 — The planner prompt's design checklist includes the trust line:
  a design that executes anything project-controlled must name the trust
  boundary and the consent gate.
- [ ] AC-006 — The plan-reviewer prompt requires a coverage ledger in the
  findings report: every review dimension appears with what was checked and
  either its findings or an explicit none; unchecked dimensions are declared
  unchecked.
- [ ] AC-007 — The plan-reviewer prompt instructs live read-only probing when
  the plan wraps an external tool: verify exit codes, output envelopes, and
  claimed flags against the real tool where available rather than trusting
  documentation, within the reviewer's read-only discipline.
- [ ] AC-008 — The plan-reviewer prompt gains a scope/size review dimension
  that applies the project's plan-size guidance and proposes split seams when
  exceeded.
- [ ] AC-009 — Review rounds are versioned: the reviewer writes findings to
  the next free `review-<n>.md`, never overwriting an existing round; the
  planner's revision pass reads all rounds and cites findings
  round-qualified; a legacy `review.md` is read as round 1 and existing plans
  keep working.
- [ ] AC-010 — The mechanical conformance check additionally verifies:
  behavior seam/test files appear in Files to Change; `D-###` citations in
  the plan body resolve to existing decision entries; supersession pointers
  are dated; `@cosmo-behavior` markers are unique per behavior; behaviors
  annotated withdrawn are excluded from required-test checks and reported as
  withdrawn; behavior count beyond the guidance is an advisory, not an error.
- [ ] AC-011 — Project gates pass (the test, lint, and type-check steps) and
  every shipped prompt/skill change remains stack-agnostic per the standing
  invariant.

## Scope

Included:

- Targeted edits to `bundled/coding/prompts/planner.md` and
  `bundled/coding/prompts/plan-reviewer.md`.
- Round-versioning of the review artifact in both prompts' contracts.
- Extensions to `lib/artifacts/behavior-conformance.ts` and its CLI rendering
  in `cli/plans/commands/check-artifacts.ts`.
- Content tests in `tests/prompts/` and unit tests in `tests/artifacts/` /
  `tests/cli/plans/` proving each behavior.

Excluded:

- Any change to agent configuration (models, thinking levels, tool grants) —
  the evidence run validated the current configuration.
- New review layers, orchestration, or workflow automation; the multi-lens
  adjudication pattern stays an on-demand practice, not shipped machinery.
- Changes to the deviation protocol, spec format, or plan format references
  beyond what round-versioning strictly requires.
- Retrofitting versioned rounds onto archived plans.

## Assumptions

- The evidence run's categorization (mechanical vs judgment findings) is
  accepted as the basis for what moves upstream; the run is documented in the
  `analysis-capabilities` plan artifacts and this conversation's review
  outputs.
- Content tests asserting exact prompt text are the established proof
  convention for prompt behaviors.
- `checkBehaviorConformance` is the single mechanical conformance seam; no
  parallel checker is introduced.
- The in-flight `analysis-capabilities` plan (with legacy `review.md` and two
  withdrawn behaviors) must pass the extended checker unmodified.

## Open Questions

None — scope was ratified in conversation on 2026-07-28; mechanics are
recorded as derived decisions in `plan.md`.