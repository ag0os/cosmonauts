## Purpose

`framework-health` fixed how the project plans and proves work. The code it
left behind has never been measured whole: the committed Fallow floors in
`.fallow-baselines/` are changed-scope floors that exist so inherited debt does
not fail a pull-request audit, and they were last re-anchored at `29fc0ce`
(N-001) precisely because `main` had drifted past them. Nobody can say today
what the whole repository's dead code, duplication, complexity, and boundary
state is, whether any of it is real, or how a later commit compares.

This plan does the audit once, properly, before feature work resumes with
`execution-liveness`. It runs every project-scope gate-facing capability
through the project's own analysis surface, reports what could not run, traces
each finding before touching it, remediates within the tiers the human ruled,
records the rest as reasoned baselines, and leaves a whole-project health
record that any future run can regenerate and compare against.

Ground truth at the start (Shepherd, 2026-09-28, Fallow 2.54.2 on `main`
`64dca3c`, raw JSON in `.shepherd/work/in-progress/project-health-audit/evidence/`):

| Capability | Whole-project result |
|---|---|
| dead-code | 133 findings: 103 unused types, 27 unused exports, 1 unused class member, 2 duplicate exports; 0 unused files, dependencies, cycles, boundary violations, stale suppressions |
| duplication | 87 clone groups in 43 families across 45 files; 3,022 duplicated lines (3.25%) |
| complexity | 226 functions over threshold: 34 critical, 55 high, 137 moderate (cyclomatic 20 / cognitive 15 / CRAP 30; coverage model `static_estimated`) |
| boundary-conformance | no zones configured in `fallow.toml`; the binding reports `provider-not-configured` |
| suppressions | 20 inline directives, all registered in `.cosmonauts/suppression-exceptions.json` |
| score | 90.5 (A) |

Of the 34 critical functions, 23 are in `lib/`, 2 in `cli/`, 2 in `domains/`,
3 in `scripts/`, and 4 are anonymous `describe`/`it` callbacks in `tests/`
(a fifth `tests/` entry, `auditMigratedSeed`, is a named test helper). The
largest is `runPass` in `lib/memory/living-memory.ts`: cyclomatic 104,
cognitive 133, 886 lines, coverage tier `partial`. Of the 43 clone families, 14
live in one file, 27 in two files, and 2 in three files.

## Intent

Goal: every whole-project static-health finding on `main` is either fixed with
behavior preserved or carried in a recorded, reasoned baseline, and the record
that says so can be regenerated and compared by any later run.

Invariants — mechanism yields to these:

- INV-001 - Missing evidence is never clean. Every project-scope gate-facing
  capability (`dead-code`, `duplication`, `complexity`,
  `boundary-conformance`) appears in the health record with its binding state
  and outcome. An unbound, unsupported, or failed capability is named as such
  and never counts as passing, never widens to a substitute, and never
  disappears from the record.
- INV-002 - Remediation preserves observable behavior. No refactor changes
  what a caller, a test, or a persisted artifact can observe. A critical
  function whose static coverage tier is below `high` gets characterization
  tests, committed and green, before its first edit. A test's expected
  behavior changes only when it pinned the defect being removed, and the
  change cites the finding.
- INV-003 - A finding is confirmed before it is acted on. Every removal,
  extraction, or refactor traces the finding through the analysis surface
  immediately before the edit (reachability and references for dead code,
  clone location for duplication, a fresh capability run for complexity). A
  finding that no longer reproduces is reported as unresolved, not fixed.
- INV-004 - Nothing is silenced. No inline suppression, threshold change,
  ignore pattern, entry-point addition, or production-scope change is
  introduced to make a finding disappear. What is not fixed is baselined with
  a written reason, and baselines change only through the provenance-recording
  refresh path with one reason per category.
- INV-005 - The health record is reproducible. It names the commit, provider
  identity and version, configuration digest, exact invocations, and result
  digests. A second run at the same commit reproduces the same finding
  identities and counts, and a run at a later commit can be diffed against it
  mechanically.

Ranking. INV-002 wins over remediation scope: a critical function that cannot
be characterized to the bound the human sets (Q-002) is escalated, never
refactored blind. INV-001 and INV-004 win over any "clean" verdict: the record
reports unbound capabilities and baselined findings as exactly that. INV-003
wins over throughput: a stale finding costs a re-run, never a guess.

Provenance. The remediation tiers in Scope are direct human rulings typed to
Shepherd on 2026-09-28 and relayed to the coordinator. The invariant wording
was drafted by the coordinator session on 2026-09-28 and **ratified as drafted
by the human on 2026-09-28** (typed to Shepherd, relayed; recorded in
`.shepherd/work/in-progress/project-health-audit/rulings-2026-09-28.md`,
Q-001). These invariants and their ranking are ratified ground and change only
by human decision.

## Users

- The maintainer, who wants to know the codebase is healthy before
  `execution-liveness` and the rest of the resumed dependency order build on
  it.
- Future coordinators and plans, who need a whole-project record to diff a
  later commit against instead of re-deriving debt from changed-scope floors.
- The Quality Manager and the `changed-scope-audit` gate, whose committed
  floors this plan refreshes so that post-audit changes are judged against the
  clean state.
- Agents holding the `analysis` capability, for whom the record is the
  reference for what "known and accepted" means.

## User Experience

The audit runs through the project's own analysis surface: `analysis_status`
for the seven binding rows, then the four project-scope gate-facing
capabilities, then `trace` per finding before any edit. Direct provider
invocation is allowed only for diagnosis and for what the surface does not
expose (whole-project baseline refresh, health snapshot), and every direct
invocation is recorded verbatim in the record.

The record is a committed, human-readable document with a machine-readable
companion. It carries a before section (the Shepherd evidence, re-derived
through the surface and reconciled) and an after section, each with the
capability table above, binding states, provider and configuration identity,
and result digests. Every baselined finding appears with its reason; every
remediated finding appears with the task that removed it and the trace that
confirmed it.

Remediation proceeds in stages that each end with the full gate set green
(test, lint, typecheck, reachability, suppression check against `main`) and
the relevant capability re-run. Dead code and duplicate exports go first, then
duplication, then complexity, so each later stage measures code the earlier
stages already cleaned. Critical functions below `high` coverage are
characterized first and the characterization commit is separate from the
refactor commit.

At the end the three changed-scope floors are refreshed through
`refresh:fallow-baselines` at the branch's final commit, one reason per
category, and the changed-scope audit is shown passing against the new floors.
The plan does not push, merge, or open a pull request.

## Acceptance Criteria

- [ ] AC-001 - The health record lists all seven capability bindings with
  their state as reported by the analysis surface, runs the four project-scope
  gate-facing capabilities, and names any unbound, unsupported, or failed
  capability explicitly. `boundary-conformance` is reported as not configured,
  with no zones authored in this plan.
- [ ] AC-002 - Project-scope `dead-code` reports zero findings in every
  category (unused files, exports, types, dependencies, enum and class
  members, duplicate exports, unresolved imports, cycles, boundary violations,
  stale suppressions) with no new suppression, ignore pattern, or entry point
  added. Any export kept because it is public API is already covered by the
  existing `entry` set; an export that would need a new entry is escalated,
  not added.
- [ ] AC-003 - Each of the two duplicate-export pairs resolves to one
  canonical location and all callers use it.
- [ ] AC-004 - Every clone family whose instances live in one or two files is
  no longer reported by project-scope `duplication`. Every remaining family is
  baselined with a written reason naming the files and why extraction was
  refused. The record states the resulting duplication percentage.
- [ ] AC-005 - Every function reported at `critical` severity in `lib/`,
  `cli/`, `domains/`, and `scripts/` is below every configured threshold
  afterward, with the characterization tests INV-002 requires committed before
  the refactor for each function whose coverage tier was below `high`.
- [ ] AC-006 - Every function remaining at `high` or `moderate` severity, and
  every `critical` function in `tests/`, is baselined with a written
  justification per file, recorded where the baseline provenance is recorded.
- [ ] AC-007 - The inline suppression count does not grow, the registered set
  in `.cosmonauts/suppression-exceptions.json` is unchanged or smaller, and
  `stale_suppressions` is zero.
- [ ] AC-008 - The three changed-scope floors are refreshed through the
  provenance-recording script at the branch's final commit, one reason per
  category, and the changed-scope audit passes against them from `main`.
- [ ] AC-009 - The whole-project health record is committed with before and
  after sections, and a second run of the recorded invocations at the same
  commit reproduces the same finding identities and counts.
- [ ] AC-010 - The full gate set is green at the final commit: tests, lint,
  typecheck, reachability, and the suppression check against `main`.
- [ ] AC-011 - No test's expected behavior changed except where the change
  cites the finding that pinned the removed defect, and every refactor task
  lists the characterization tests it added.

## Scope

In scope, as ruled by the human on 2026-09-28 (typed to Shepherd, relayed;
ratified ground):

- This plan runs now, before `execution-liveness`.
- Dead code and duplicate exports: fix all.
- Duplication: extract every family that lives in one or two files; baseline
  the rest with a reason.
- Complexity: refactor the `critical` tier only; `high` and `moderate` get a
  justified baseline with a written justification per file.

Decided by the coordinator (derived, override freely):

- `scripts/` critical functions are in scope for refactoring. They are
  repository gates and maintained code (`check-reachability.ts` is a
  configured check; `validate-harness-exports.ts` guards the harness export
  contract), two of the three carry `high` static coverage, and the third
  (`visit`, coverage `none`) gets characterization tests first.
- `tests/` critical functions are out of scope for refactoring and are
  baselined. Four are anonymous `describe`/`it` callbacks whose complexity is
  the number of cases they hold; splitting them changes suite structure, not
  behavior. `auditMigratedSeed` is a test helper whose branches are the
  assertion set it encodes. All five get a written reason in the baseline.
- Coverage tiers come from Fallow's `static_estimated` model. Where a
  characterization decision hinges on the tier, the plan may confirm it against
  the test runner's coverage report, but the static tier is the trigger.
- Dead-code remediation prefers dropping the `export` keyword or deleting the
  declaration over any configuration change.

Out of scope:

- New analysis providers, provider routing, boundary-zone authoring, richer
  rule sets, or CI enforcement (`analysis-tools`).
- Wiring analysis into the worker write loop (`worker-inloop-analysis`).
- Applying provider fixes automatically; `fix-preview` stays preview-only.
- Bumping Fallow, Pi, or any dependency.
- Refactoring `high` or `moderate` functions, or any file not named by a
  finding.
- Pushing, merging, or opening a pull request.

## Assumptions

- Fallow 2.54.2 is the bound provider, execution consent for this project is
  recorded outside the repository, and the analysis surface at `main`
  `64dca3c` returns the same finding set as Shepherd's direct run. AC-001
  reconciles the two; a mismatch is reported in the record, not resolved by
  picking one.
- Thresholds stay at cyclomatic 20, cognitive 15, CRAP 30, and `fallow.toml`
  (a gate-owned path) is not edited by this plan.
- The `tests/` baseline decision leaves the health score's `tests/`
  contribution unchanged; the record reports the score but no acceptance
  criterion depends on it.
- `runPass` and the other partial-coverage critical functions have enough
  reachable entry points that characterization tests can be written without
  new seams; if a function needs a seam to be testable, the seam is added in
  the characterization commit and named in the task.

## Open Questions

None open. All three were ruled by the human on 2026-09-28 (typed to
Shepherd, relayed; `.shepherd/work/in-progress/project-health-audit/rulings-2026-09-28.md`).
The rulings are ratified ground:

- Q-001 - Intent INV-001..005 and the ranking: **ratified as drafted**.
- Q-002 - Risk bound for critical refactors: **(a)**. A critical function that
  cannot be characterized to a reasonable bound (`runPass`: 886 lines, 104
  paths, `partial` coverage) is refactored with the best characterization
  tests writable plus the full suite, accepting residual risk. Hard stop and
  escalate if any test expectation would have to change. Rejected: (b)
  baselining it as an exception to the critical ruling.
- Q-003 - Duplication ruling consequence: **confirmed**. 41 of the 43 clone
  families (85 of 87 groups, about 1,730 duplicated lines) live in one or two
  files and are all extracted; the two three-file families are baselined with
  reasons.

The coordinator's derived decisions stand (human, 2026-09-28): `scripts/`
critical functions in scope, `tests/` critical functions baselined, static
coverage tier as the characterization trigger, no `fallow.toml` edits.