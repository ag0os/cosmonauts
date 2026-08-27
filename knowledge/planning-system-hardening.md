---
type: decision
title: Planning system hardening
description: Archived plan distillation for planning-system-hardening.
resource: knowledge/planning-system-hardening.md
tags:
  - 'plan:planning-system-hardening'
  - 'source:legacy-distillation'
timestamp: '2026-07-29T00:00:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/planning-system-hardening.md
date: '2026-08-20T17:05:15.000Z'
legacySource: archive
legacyPlan: planning-system-hardening
legacyDistilledAt: '2026-07-29T00:00:00.000Z'
legacySourceSha256: cfc0fd62f5e362b029dc2c79656d24a9c7ec47d0a46a0cb90fc69a71ace8b91c
---

# Planning system hardening

## What Was Built

The mechanical defect categories observed in the `analysis-capabilities`
planning run were upstreamed into the layers that catch them cheaply. The
planner prompt gained five authoring rules (closing consistency pass,
state-space enumeration with no implementer-decided cells, enforced size
checkpoint, test-provability rule for Expected clauses, trust-boundary line).
The plan-reviewer prompt gained three recall mechanisms (per-dimension
coverage ledger with explicit "none", live read-only probing of wrapped
external tools, a scope/size dimension). Review rounds are now versioned
(`review-<n>.md`, legacy `review.md` reads as round 1, never overwritten).
The conformance checker (`cosmonauts plan check-artifacts`) grew four issue
kinds — unresolved decision citations, undated supersessions, unpaired
behavior files, duplicate markers — plus a non-blocking advisories channel
and first-class withdrawn behaviors.

## Key Decisions

- Upstream mechanical checks instead of institutionalizing more adversarial
  review: ~70% of the third-layer findings in the evidence run were
  mechanical categories; the multi-lens adjudication pattern stays an
  on-demand practice for large/risky plans, not shipped machinery.
- Quoted text is mention, not citation: citation/supersession scans mask
  inline code spans and fenced blocks. Added mid-run when the checker
  flagged its own plan's prose (foreign-plan decision IDs and the literal
  annotation grammar).
- Withdrawal requires the exact dated annotation
  `*(withdrawn by D-###, <date> — reason)*` to END the heading in BOTH the
  raw and the quote-masked views — either check alone is bypassable.
- Supersession dating: a structured decision-ID pointer dates itself; a
  descriptive `Supersedes:` ground needs an ISO date within its decision
  entry (usually the Decided-by line).
- Plan size is advisory, never blocking (behavior count > 12 warns).
- Round versioning is prompt-contract only; no `lib/` code reads rounds. A
  fixer's artifact-viewer implementation was reverted: out of scope and it
  followed symlinks after a lexical-only path check.

## Patterns Established

- Behavior `Expected` clauses state what the named test can assert;
  content-tested behaviors state text obligations, not runtime outcomes.
- Withdrawn behaviors keep their ID with the dated annotation; the checker
  excludes them from evidence checks and reports the count.
- Cross-plan decision references in prose are written as code spans
  (`` `D-008` ``) so they read as mentions.
- Non-blocking signals ride the `advisories` array on
  `ArtifactConformanceResult`, rendered distinctly in all CLI formats.
- Every Markdown semantic test picks its correct view: raw lines,
  fence-masked, or quote-masked (`scanMarkdown` produces all three).

- **Broad plan review can fan out specialized lenses — on demand, not as standing orchestration (from dialogic-planner).** The shipped security-reviewer, performance-reviewer, and ux-reviewer agents share one output shape with distinct lenses; independent lenses run in parallel and findings combine before build work starts. Specialization buys depth without serializing unrelated analysis, and the common format keeps aggregation predictable. This stays an on-demand pattern — this plan explicitly decided against standing multi-lens review orchestration.

## Files Changed

- `bundled/coding/prompts/planner.md`, `plan-reviewer.md` — the eight new
  rules/mechanisms plus round-aware review contracts.
- `lib/artifacts/behavior-conformance.ts` — new issue kinds, advisories,
  withdrawn handling, three-view Markdown scanning, block-bounded inline
  masking; rendered via `cli/plans/commands/check-artifacts.ts`.
- `tests/prompts/planner.test.ts`, `plan-reviewer.test.ts`,
  `tests/artifacts/behavior-conformance.test.ts`,
  `tests/cli/plans/subcommand.test.ts` — behavior-marked proofs and the
  review-loop regressions.

## Gotchas & Lessons

- The new checker failed its own plan on first run (TASK-511): prose that
  documents a grammar trips the scanner for that grammar. Expect this
  whenever a plan documents the syntax it enforces; quote examples as code.
- Markdown masking earned three review rounds of edge cases: whole-document
  span pairing let stray backticks hide citations; a code-quoted trailing
  span masked to spaces and satisfied an end-of-line anchor; raw-line entry
  boundaries were split by fenced examples. Inline pairing must be bounded
  to block scale (blank lines, headings, list items) and every check must
  name its view.
- The QM panel under-remediates (known) — six REVIEW-FIX commits still left
  two real findings — and one fixer change was out-of-scope and unsafe;
  check fixer diffs against the plan's file set before trusting them.
- The QM review panel writes generic `review-round-N.md` names in
  `missions/reviews/` and overwrote rounds from an earlier plan — the same
  overwrite defect this plan fixed for plan reviews. Open follow-up.
- The codex loop converged in three rounds (6 findings → 2
  regressions-of-fixes → SHIP). Regressions introduced by review fixes are
  real; re-review after fixing is not optional.
