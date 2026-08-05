---
source: archive
plan: analysis-investigation-procedures
distilledAt: 2026-08-05T00:00:00.000Z
---

# Analysis investigation procedures

## What Was Built

Slice 3 of 3 of the ratified `analysis-capabilities` design, and the slice that
closes it. Planner, Plan Reviewer, Worker, and Refactorer previously held the
capability tools and the shared analysis skill but had no procedure telling them
to gather structural evidence before designing, trace a symbol before deleting
it, or audit the changed scope before calling a task done. All four now do,
written entirely in capability terms with no analyzer name or command. The
`analysis-tools` ROADMAP entry was refreshed and the parent design is complete.

The whole deliverable is four prompt edits and four content tests. No runtime
code changed — `git diff` over `lib/`, `bin/`, and the extensions is empty.

## Key Decisions

- **D-021's asymmetry is the design, not an omission.** Investigation roles
  (Planner, Plan Reviewer) gate nothing, so they carry only a two-way protocol:
  evidence, or no evidence — record it. Implementing roles (Worker, Refactorer)
  carry the full `completed`/`unbound`/`unsupported`/`failed` protocol because
  completion decisions depend on it. Teaching gate semantics to a role that
  gates nothing is prompt surface with no acceptance criterion behind it.
- **The two-way protocol still preserves INV-2.** The spec's UX narrative
  mentions unsupported-metric for the planner, which reads as tension with
  D-021. It collapses cleanly: "no evidence — record it, and never read missing
  evidence as a clean baseline" carries the invariant without the vocabulary.
  The shared skill holds the four-state detail for roles that need it.
- **B-020/Explorer stays withdrawn.** `Withdrawn: 1` in the conformance report
  is the expected outcome. Explorer still benefits passively from the shared
  skill and the injected status block.
- **A backlog entry should defer to the contract, not paraphrase it.** The
  ROADMAP entry now points at `gate-contracts.md` for the resolution vocabulary
  instead of restating it. That change is what finally ended a seven-round
  review class — see Gotchas.

## Patterns Established

- **Scope a negative guard to the region whose invariant it protects.** The
  D-021 guard originally banned the words `failed` and `unbound` from the entire
  planner prompt — ordinary English words, so it would fail on unrelated future
  prose while proving nothing more. `procedureBlock(content, opening)` in
  `tests/prompts/analysis-procedures.test.ts` splits on blank lines and returns
  the one procedure paragraph; the vocabulary assertion runs against that. Prove
  such a helper non-vacuous with a negative control before trusting it.
- **Guard both roles when one decision governs both.** B-021 originally shipped
  with no D-021 guard at all while B-019 had an over-broad one. An asymmetric
  guard for a symmetric rule is a coverage gap, not a style difference.
- **Pin operative sentences, never bare tokens.** Carried forward from slice 2
  and applied to all four new tests.
- **Give a prompt-editing task an explicit preservation constraint when the file
  has two owners across slices.** TASK-551 named the slice-2 migration-sweep
  clause and forbade rewriting it; it survived byte-identical, confirmed by
  SHA-256 in three independent review rounds.

## Files Changed

- `bundled/coding/prompts/planner.md` — investigation before design, evidence or
  explicit absence into design and risks; indented into step 2 of "How you work".
- `bundled/coding/prompts/plan-reviewer.md` — capability evidence for duplicate
  paths, dependency direction, and deletions; unavailable evidence becomes an
  `unchecked` Coverage Ledger dimension with its reason, never a silent `checked`.
- `bundled/coding/prompts/worker.md` — task-start SHA recorded as the audit base,
  trace-before-delete, audit before commit and before Done, full four-state
  protocol with `failed` blocking completion. Slice 2's migration clause intact.
- `bundled/coding/prompts/refactorer.md` — structural-change base, trace before
  move/remove, full protocol, and an explicit rule that no-behavior-change
  discipline outranks every metric.
- `tests/prompts/analysis-procedures.test.ts` — four behavior tests plus the
  `procedureBlock` / `GATE_OUTCOME_VOCABULARY` helpers. Net +4 tests, zero
  declarations removed.
- `ROADMAP.md` — `analysis-tools` entry refreshed; six remaining-work bullets.

## Gotchas & Lessons

- **Ten review findings, every one in prose, none in the deliverable.** Seven
  codex rounds plus a self-review pass. The four prompts, four tests, D-021
  asymmetry, and preserved migration clause were re-confirmed clean in *every*
  round. All churn was in the ROADMAP entry and one task note. When a review
  keeps returning findings, check whether they are clustering in a summary you
  wrote rather than in the thing you built.
- **Fixing a conflation can introduce a conflation.** Round 4 existed only
  because the round-3 fix invented a new umbrella ("gates degrade visibly") that
  swept blocking `failed-to-run` in with two genuinely degraded gates.
- **"Audit every claim" was too shallow a generalization.** Rounds 5 and 6 were
  fresh instances after it. What ended the class was writing *less* — deferring
  to `gate-contracts.md` instead of paraphrasing it.
- **`unbound` and `unsupported` are not synonyms, and the distinction is the
  whole point.** A project with no provider surfaces all seven capabilities as
  `unbound`; `unsupported-*` is reachable only *after* a binding exists. Using
  "unsupported" as loose English inside this design is a vocabulary error.
- **Provider detection keys on config files or a package dependency, never on
  project language.** A non-JS repository carrying that signal binds normally.
  Any claim of the form "non-JS projects do X" is wrong by construction.
- **Coverage attaches only to verdict-bearing results.** `lib/analysis/types.ts`
  makes it structural — `trace` and `fix-preview` cannot carry it. D-013
  enforced by the type rather than by convention.
- **A `codex exec` killed by `timeout` can leave an orphaned child running for
  over an hour**, and that orphan is enough load to make `tests/driver/*` time
  out in full-suite runs while passing in isolation. Kill orphans (`pkill -x
  codex`) before trusting a red suite. This is a new, concrete cause for the
  previously-vague "driver tests flake under concurrent load" note.
- **`tests/driver/run-step.test.ts > uses frozen episode actor…` fails on clean
  `main` too** (2864/2865 there) — a 5000ms wall-clock timeout, not an
  assertion. It belongs to `episodic-log#B-018` and is worth a follow-up on that
  plan's ground. Prove attribution by checking out the base branch and running
  the suite there before blaming your own work.
- **The Quality Manager panel still writes the generic
  `missions/reviews/review-round-1.md`** and clobbered another plan's tracked
  review. It restored the file itself this time, but the plan-scoped-naming bug
  on the ROADMAP is real. Keep review records under `missions/plans/<slug>/`.
- **The QM's final verdict is still lost to the ~200-char stage-summary
  truncation.** Its review panel returned `overall: correct` with zero findings
  on disk, but the chain result ended mid-sentence at "final verdict will
  follow". Read the on-disk artifact; do not wait for the summary.
- **The `missions/tasks/config.json` writer bug is still live** — spaces against
  Biome's tabs on a file whose content never changes. Restore it, keep the
  `biome.json` exclusion.
