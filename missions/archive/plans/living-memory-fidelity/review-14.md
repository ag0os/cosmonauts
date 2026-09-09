# QM Round 3 Closing Structural Review: living-memory-fidelity

- Date: `2026-09-08`
- Task: `TASK-659`
- Remediation commit: `fb20812` (`68a4932..fb20812`)
- Review scope: the complete SR-014 source-contract remediation, both production
  consolidation adapters, all three corpus omission classifications, the
  deterministic and judgment paths, the Stage-2/3/4 regression seams, the
  permanent fidelity/parent pack, and the permitted boundary.
- Verdict: **pass - zero unresolved high or medium findings; the reporting-fidelity
  chain SR-011 through SR-014 is complete**

## Findings

No high or medium findings remain.

The SR-014 remediation represents the missing distinction at its owning source
boundary. `ConsolidationSourceSnapshot.deferred` is required, documented as the
source-local bounded subset of `omitted`, and validated as a safe integer in the
inclusive range `0..omitted`. The aggregate collector adds only its own later cap
deferrals to both totals. It no longer infers a source's count from
`inventoryComplete`. Result assembly emits `source-deferred` from `deferred` and
computes the integrity count as `omitted - deferred`, so the two diagnostics are
independent and exhaustive without changing the total.

The only production source constructors in `lib/` and `cli/` are
`createProjectCorpusConsolidationSource()` and
`createProjectEpisodeConsolidationSource()`; the CLI composes both. Each now
populates every snapshot field on which the reported source result depends. No
production adapter in scope leaves `deferred` absent or inferred.

## Real-Adapter Coverage and Mutation Check

The three corpus cases in `tests/memory/living-memory.test.ts` create temporary
project roots and invoke `createProjectCorpusConsolidationSource()` directly.
They do not inject a fixture source. The mixed case places two valid OKF records
and one malformed record behind the real knowledge store, applies a one-record
cap, and reaches the real aggregate collector and result assembly. The episode
case likewise writes two valid episodes and one malformed episode, then invokes
`createProjectEpisodeConsolidationSource()` through the real consolidator.

The reviewer independently proved that this coverage detects missing adapter
wiring. Two isolated archives of `HEAD` were created under temporary directories
and linked to the repository's installed dependencies; neither copy addressed
live `knowledge/`. In the first copy only the corpus adapter's returned field was
changed to `deferred: 0`, then this command ran:

```sh
bun run test -- tests/memory/living-memory.test.ts --grep 'distinguishes integrity omissions from bounded source deferrals|reports cap deferrals and integrity omissions for the same source'
```

It failed both selected tests. The all-cap source summary received `deferred: 0`
instead of 1; the mixed case suppressed `source-deferred` and inflated integrity
from 1 to 2. In the second copy only the episode adapter's returned field was
changed to `deferred: 0`, then this command ran:

```sh
bun run test -- tests/memory/living-memory.test.ts --grep 'reports episode cap deferrals separately from integrity omissions'
```

It failed because the production episode summary received `deferred: 0` instead
of 1. These are executable negative controls against the exact blind spot that
produced SR-014, not fixture-only evidence.

## Three-Case Production-Corpus Assessment

| Case | Production setup | Reported source summary | Diagnostic result | Assessment |
|---|---|---|---|---|
| All cap-deferred | Two valid project knowledge records; real corpus adapter receives a one-record limit. | `admitted: 1`, `omitted: 1`, `deferred: 1`, complete. | Exactly one `source-deferred` with count 1; no integrity diagnostic. | Pass. |
| All integrity | One malformed project knowledge record through the real knowledge store. | `admitted: 0`, `omitted: 1`, `deferred: 0`, incomplete. | Exactly one `source-inventory-incomplete` with count 1; no cap diagnostic. | Pass. |
| Mixed | Two valid and one malformed project knowledge record; real corpus adapter receives a one-record limit. | `admitted: 1`, `omitted: 2`, `deferred: 1`, incomplete. | Both diagnostics appear, each with count 1. Neither suppresses the other. | Pass. |

`omitted` retains its prior meaning: at the corpus adapter it is the total number
of current project candidates not returned, regardless of cause; at the episode
adapter it is the total candidate count not returned; and the aggregate collector
adds any later collector cap to both `omitted` and its bounded subset `deferred`.
The new field partitions the existing total rather than redefining it.

The production episode source can and does cap-defer records through record-count,
per-record byte, and aggregate-byte bounds. Its direct paging and byte-boundary
tests pin `deferred: 1`, and its real mixed-source consolidator test reports
`omitted: 2`, `deferred: 1`, with one cap and one integrity diagnostic. The
counterfactual mutation above proves that this result depends on the adapter's
own count.

## Regression and Path-Parity Assessment

- SR-010 remains closed. The remediation changes source collection before the
  deterministic/judgment split and does not change either continuation. The
  exact full-row parity test for pressure-blocked retirements passes in both
  modes.
- SR-013 remains closed in both directions. The production all-cap,
  all-integrity, and mixed cases prove cause separation and exact counts; the
  mixed corpus and episode cases prove simultaneous diagnostics.
- The Stage-2 completeness barrier remains before receipt discharge,
  representation/no-work conclusions, judgment/proposal materialization, and
  retirement. Its incomplete-corpus spy test passes, and the production mixed
  cases still return `failed` while preserving both diagnostics.
- Stage-3/4 committed-write recording is undisturbed. The remediation commit
  changes no `living-memory.ts`, receipt, retirement, proposal, or durable-file
  operation. The first-removal error, source-recovery-only,
  materialization-only, and complete commit-interleaving regressions pass.
- The exact search for `observedRetirementCandidates.length` has no match under
  `lib/memory/`; the pre-SR-001 slice pattern has not reappeared.

## Parent Ownership, Scope, and Ratified Ground

- All six exact parent marker/name carriers remain exact and parent-owned: the
  B-012 public-consolidate owner; the B-016 convergence owner plus record-limit
  and byte-limit carriers; and the B-021 exact-renderer owner plus
  oversized-metadata carrier. Their focused selection passes.
- `lib/memory/types.ts` is unchanged by the remediation and hashes to
  `e99b985dc29a5c739189f5744661740d33afb76b0b6e4b786df9e9f8ff62cede`,
  matching all three full-source pins. Receipt-floor, retirement/byte authority,
  fail-closed validation, and existing marker assertions remain present and pass.
- Commit `fb20812` changes only `lib/memory/consolidation-sources.ts` and mirrored
  tests under `tests/extensions/` and `tests/memory/`. This review task authors
  only this new plan review record. Drive-owned task-state edits under
  `missions/tasks/` pre-existed the review record and are required run state, not
  reviewer-authored implementation scope.
- `review-14.md` was absent before this task and is the next unused integer after
  `review-13.md`. No earlier review was overwritten, renamed, or deleted.
- `lib/memory/retirement-store.ts` is byte-identical to `main` at SHA-256
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.
  The remediation diff adds, removes, or reorders no durable apply, persist,
  receipt materialization, finalize, recover, rename, unlink, replace, remove,
  restore, or sync operation. D-026 is not reopened and retirement pathname
  sequencing is untouched.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. These statuses are degraded/unbound, never clean;
manual evidence and test results do not convert an unbound gate into a passing
structural-analysis result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Isolated counterfactual mutations prove both production adapter tests fail when their returned count is zeroed. No executable mutation-analysis evidence exists. |
| `duplication` | **degraded/unbound** | Traced the count from both source adapters through one aggregate fold and one result assembly; no second cause inference remains. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced all count branches, contract validation, the completeness barrier, and both continuations; the new state is a bounded subset count, not another state machine. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact commit paths, imports, production CLI composition, parent carriers, D-026 exclusion, and review numbering. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked every production `deferred` producer and all aggregate/result consumers; both production adapters are CLI-composed. No repo-wide sweep ran and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: the exact repository-root commands returned
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`
  and 237 files.
- Focused real-adapter, three-case, episode, SR-010, Stage-2/3/4, and six-parent-
  carrier selection: passed, 3 files and 14 selected tests.
- Complete fidelity, parent-carrier, CLI, source, and commit-interleaving pack:
  passed, 6 files and 149 tests.
- Counterfactual corpus mutation: failed as required, 2 selected tests, both at
  the production adapter's expected source summaries/diagnostics.
- Counterfactual episode mutation: failed as required, 1 selected test at the
  production adapter's expected source summary.
- `bun run test`: passed on the final exact run, 263 files and 3,090 tests. A
  preliminary run and its first isolated retry exposed one unrelated detached
  driver startup timeout (`first-plan-lock.json`; child exit code 127); the next
  isolated retry passed, and the final full run passed including that test.
- `bun run lint`: passed, 580 files checked with no fixes.
- `bun run typecheck`: passed.
- `git diff --check`: passed after the review record was finalized.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity`: passed with
  artifact conformance GREEN: 12 behaviors, 0 issues, and 0 advisories.
- Live corpus guard after review: the exact repository-root commands returned
  the same digest and 237 files.

## Closing Assessment

The reporting-fidelity chain is complete: SR-011's omission reporting, SR-013's
cause separation, and SR-014's source-owned production adapter count now compose
without suppression or misattribution. Both production adapters in scope
populate every snapshot field consumed by the reported result, the aggregate
preserves exact totals and bounded subsets, and all direct/counterfactual evidence
crosses the real adapter boundary that prior fixture tests missed.

There are zero unresolved high or medium findings. All final repository gates
pass, and this plan is ready for handoff and closure.
