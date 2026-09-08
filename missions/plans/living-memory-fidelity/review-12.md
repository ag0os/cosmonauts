# QM Round Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-08`
- Task: `TASK-655`
- Remediation commit: `92f7a5c` (`92f7a5c^..92f7a5c`)
- Review scope: the current complete permitted implementation, with the
  deterministic fast path and judgment path traced independently rather than
  accepting the remediation diff or its green tests as sufficient evidence.
- Reviewer context: TASK-642 applied SR-001 only to the judgment path, leaving
  its near-duplicate deterministic sibling defective through ten fresh review
  rounds. This review therefore enumerated all twelve plan behaviors against
  both continuations and inspected the reporting changes in both directions.
- Verdict: **fail - one unresolved medium finding; TASK-655 must not close**

## Findings

### SR-013 - MEDIUM - A mixed-cause source still loses genuine cap-deferral reporting

`collectConsolidationSources()` combines two different omission causes into one
per-source `omitted` value: the source-provided count and the aggregator's real
record-cap `deferred` count (`lib/memory/consolidation-sources.ts:911-917`). It
preserves only one source-wide `inventoryComplete` boolean. Result assembly then
emits `source-deferred` only when that whole source is complete
(`lib/memory/living-memory.ts:218-223`).

Consequently, if one source has both an integrity omission and a genuine record-
cap deferral, the integrity classification suppresses the bounded-deferral
diagnostic for the same source. The new regression uses two separate sources,
one per cause, so it does not exercise the merged state that production source
summaries expose.

The final read-only probe was stored outside the repository and run with the
exact command:

```sh
bun /tmp/task-655-mixed-source-probe.ts
```

The probe creates one source returning two valid records plus `omitted: 1`,
`inventoryComplete: false`, and one warning, sets `maxCorpusRecords` to 1, and
prints only the result kind, reason, source summaries, and declines.

Its corrected run produced:

```json
{
  "kind": "failed",
  "reason": "Consolidation source inventory is incomplete.",
  "sources": [
    {
      "sourceId": "mixed-source",
      "admitted": 1,
      "omitted": 2,
      "inventoryComplete": false
    }
  ],
  "declines": [
    {
      "code": "source-inventory-incomplete",
      "sourceId": "mixed-source",
      "reason": "Consolidation source mixed-source reported incomplete inventory; absence-dependent work is blocked."
    }
  ]
}
```

One omitted item is the declared integrity omission and one is the real global
record-cap deferral, but no `source-deferred` diagnostic survives. Safety remains
fail-closed, so this is medium rather than high, but SR-011 and TASK-655 AC #7
are not closed. The remediation needs cause-preserving reporting (for example,
separate integrity and bounded omission counts or an explicit cap diagnostic)
and a one-source mixed-cause regression. It must not infer a cause from the
aggregate `omitted` count.

The first version of this optional inline probe used non-canonical lock options.
The actual command was the same inline harness with `retryMs: 1` and
`timeoutMs: 1`; it exited 1 with:

```text
error: Living-memory lock options require a 50 ms retry and 10-second timeout.
at assertLockOptions (.../lib/memory/living-memory.ts:2442:13)
Bun v1.2.22 (macOS arm64)
```

The corrected probe used the required `50`/`10000` values. Neither invocation
performed a durable write or touched the live corpus.

## Twelve-Behavior Path-Parity Enumeration

The split is at `lib/memory/living-memory.ts:440`. Shared-prefix behavior was
checked before the split, then both post-split continuations were traced through
their result reconstruction and outer committed-error fold.

| Behavior | Deterministic fast path | Judgment path | Assessment |
|---|---|---|---|
| B-001 exact pressure/injection parity | Consumes the single `collected.knowledgeIndex` measured at `:228-251` before the split. | Consumes the same already-measured value. | Equal; no second query, renderer, or body-derived projection appears in either continuation. |
| B-002 unusable pressure | Builds zero apply candidates, explicit pressure-deferred rows, and `retirement-pressure-deferred` declines at `:467-543`. | Performs the same bounded-candidate gate and reporting at `:643-665` and `:887-927`. | SR-010 is closed for the named row/status/reason/code contract; the direct parity regression passes. |
| B-003 warning-byte parity and append-only warnings | Source warnings enter `details` at `:212-227`; citation warnings append at `:409-421`; retirement warnings append at `:544-547`. | Uses the same shared warnings and appends retirement warnings at `:928-931`. | Equal and OR/append-only; neither continuation replaces prior warnings. |
| B-004 warned corpus omission | Corpus completeness and warnings are resolved by the source and aggregate before pressure and before the split. | Same. | Equal; both are stopped by the shared barrier. |
| B-005 completeness barrier | Cannot reach the fast path when aggregate inventory is incomplete because `:252-271` returns first. | Cannot reach judgment, receipt write, proposal work, finalization, or retirement for the same reason. | Equal fail-closed behavior. |
| B-006 malformed episode visibility | Episode parsing, omission count, warning, and incompleteness occur in the shared collector before either continuation. | Same. | Equal; the warning remains in the failed result. |
| B-007 committed error truth | Shared retirement recovery, source recovery, receipt discharge, wrappers, and outer catch retain committed state; deterministic proposal and retirement calls use those wrappers. | Uses the same wrappers/catch, plus structurally tagged receipt/finalization mutations. | Equal at common seams; judgment-only durable seams also record before later work. |
| B-008 source-recovery monotonicity | Source recovery is folded at `:162-167` before the split and a recovery-only pass returns `ran`. | Same. | Equal; later reconstruction in both paths spreads the current details and cannot reset true. |
| B-009 parent ownership | Runtime path does not alter marker ownership. | Same. | All six exact parent marker/name carriers remain exact and executable. |
| B-010 real CLI composition | The real `--no-model` composition exercises this continuation with the canonical source/pressure contract. | Full mode enters through the same composition and shared prefix. | No parallel query/measurement path found; copied-corpus CLI regression passes. |
| B-011 public result and pins | Returns the same public details shape, including per-source completeness and measured/unusable pressure. | Same, plus judgment-only receipt path when present. | Shared contract is intact and the `types.ts` pin was re-established in the same remediation commit. |
| B-012 materialization-only committed transition | Does not create judgment receipts. Stale discharge and accepted-episode recovery run before the split, so pre-existing common receipt work is not bypassed. | Receipt acceptance, replay, episode finalization, pressure-gated materialization, and the materialization commit bit remain explicit at `:613-720` and `:836-886`. | No path-parity defect found: common lifecycle work is shared; receipt creation/materialization is correctly judgment-only. |

The durable-seam search over `92f7a5c^..92f7a5c` found no added, removed, or
reordered `apply`, `persist`, receipt write/materialize, finalize, recover,
rename, unlink, replace, remove, or restore call. The remediation changes only
report assembly and public reporting fields around those seams.

## SR-010, SR-011, and SR-012 Assessment

- **SR-010:** closed. Both paths bound retirement candidates before pressure
  classification, skip non-empty apply when pressure is unusable, preserve the
  same deferred row status/reason, and emit the same
  `retirement-pressure-deferred` code. No
  `observedRetirementCandidates.length` fallback remains in `lib/memory/`.
- **SR-011:** not fully closed because of SR-013. A pure integrity source is no
  longer called bounded, and a separate complete bounded source is still called
  bounded, but the source-level classifier cannot report both causes when they
  coexist in one source.
- **SR-012:** closed. `details.sources` preserves each source's
  `inventoryComplete`; incomplete declines carry the exact `sourceId`; a
  complete source is filtered out and is never named as incomplete. The silent
  incomplete-source regression passes.

## Parent Ownership, Scope, and Ratified Ground

- All six parent carriers remain exact: the B-012 owner in
  `tests/memory/interface.test.ts`; the B-016 owner and record/byte-limit
  carriers in `tests/memory/living-memory.test.ts`; and the B-021 owner plus
  oversized-metadata carrier in the extension/living-memory suites.
- `lib/memory/types.ts` hashes to
  `af3253f2bb0f9c2e06511db527cc122444955144701f5bc43463bb2db92777be`,
  matching all three full-source pins. Receipt-floor, retirement/byte
  authority, fail-closed validation, and existing marker assertions remain.
- The remediation commit changes only `lib/memory/consolidation-sources.ts`,
  `lib/memory/living-memory.ts`, `lib/memory/types.ts`, and their mirrored tests
  `tests/memory/interface.test.ts` and `tests/memory/living-memory.test.ts`.
  This reviewer authored only this plan review record; Drive-owned task-state
  edits are separate run state.
- Main/current region hashes match exactly for both corpus body-admission
  carriers (`admittedBodies` and `representedKeys`), the whole
  `scanKnowledgeFile()` per-file aggregate-deferral implementation, the whole
  `directEpisodePaths()` implementation, and the whole `listKnowledgeFiles()`
  implementation. The four deliberately out-of-scope findings are unchanged.
- `lib/memory/retirement-store.ts` is byte-identical to `main` at SHA-256
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.
  D-026 was not reopened, retirement pathname sequencing is untouched, and the
  remediation diff contains no reordered operation.
- `review-12.md` was absent before this task and is the next unused integer after
  `review-11.md`. No existing review record was overwritten, renamed, or
  deleted.

## Structural Gate Status

No executable structural-analysis capability was registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. Manual inspection found SR-013; absence of tool
findings is not a passing structural result.

| Gate | Status | Manual evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Traced every common and path-specific durable seam, committed tag/fold, and inverse no-write control. No executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Compared both retirement-reporting siblings and checked the single query, renderer input, renderer, and committed-state accumulator. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced all twelve behaviors across the shared prefix and both continuations; the merged omission state produced SR-013. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected remediation paths, imports, parent carriers, pins, review numbering, and exact out-of-scope regions. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked changed fields, types, adapters, and consumers within the permitted diff only. No repo-wide sweep ran and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: exact repository-root commands returned
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`
  and 237 files.
- Focused path-parity/reporting/behavior selection: passed, 1 file and 8 selected
  tests.
- Complete fidelity, parent-carrier, CLI, and commit-interleaving pack: passed,
  6 files and 147 tests.
- `bun run test`: final authoritative rerun passed, 263 files and 3,088 tests.
  The preliminary run had one unrelated detached-driver timeout in
  `tests/driver/cross-plan-commit-lock.test.ts` while the other 3,087 tests
  passed; `bunx vitest run tests/driver/cross-plan-commit-lock.test.ts` then
  passed in isolation before the complete rerun passed.
- `bun run lint`: passed, 580 files checked with no fixes.
- `bun run typecheck`: passed.
- `git diff --check`: passed after the review record was written.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity`: passed with
  12 behaviors, 0 issues, and 0 advisories.
- Live corpus guard after review: the same exact commands returned the same
  digest and 237 files.

## Assessment

SR-010 is closed and no deterministic/judgment asymmetry remains in the twelve
plan behaviors or the explicitly named pressure, completeness, committed-write,
warning, and receipt-lifecycle seams. SR-012 is also closed, and the out-of-
scope findings remain byte-identical to `main`.

SR-011 is not closed for a source with mixed omission causes. One unresolved
medium finding therefore remains, so the zero-high/medium threshold is not met.
Open a bounded reporting remediation for SR-013 with a one-source mixed-cause
counterexample, then perform another fresh structural review before closure.
