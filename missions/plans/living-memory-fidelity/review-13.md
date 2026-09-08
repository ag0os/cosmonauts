# QM Round 2 Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-08`
- Task: `TASK-657`
- Remediation commit: `e259b58` (`3629d7f..e259b58`)
- Review scope: the complete SR-013 reporting remediation, its three omission
  classifications, the deterministic and judgment retirement-reporting paths,
  the permanent fidelity/parent regression pack, and the permitted boundary.
- Verdict: **fail - one unresolved medium finding; TASK-657 must not close**

## Findings

### SR-014 - MEDIUM - Source-local mixed omissions still collapse into integrity

The remediation separates only deferrals performed by
`collectConsolidationSources()` from the source's aggregate `snapshot.omitted`
count. The collector computes `deferred` as its own local cap count plus the
whole source count only when `snapshot.inventoryComplete` is true
(`lib/memory/consolidation-sources.ts:916-921`). When the source is incomplete,
every source-local omission is therefore treated as an integrity omission.

That inference is not valid for the production sources. The project-corpus
source applies `input.limit`, record-byte and aggregate-byte bounds before it
returns, then reports all missing candidates through one `omitted` count while
setting `inventoryComplete` false for any warning or uninventoried read decline
(`lib/memory/consolidation-sources.ts:233-350`). The episode source likewise
increments one `omitted` count for record-cap, byte-cap, and malformed-record
cases while only malformed records make the inventory incomplete
(`lib/memory/consolidation-sources.ts:374-447`). A source can consequently have
both a genuine bounded omission and an integrity omission before the aggregate
collector sees its returned records.

Result assembly emits `source-deferred` from `source.deferred`, while the
integrity diagnostic reports `source.omitted - source.deferred`
(`lib/memory/living-memory.ts:218-224,253-263`). For a source-local mixed case,
the cap diagnostic is suppressed and the integrity count repeats the aggregate.
This violates both directions of SR-013 and the per-cause count requirement.

The read-only production-source probe used a temporary project with two valid
knowledge records, one malformed knowledge record, and both record ceilings set
to one. It invoked the real `createProjectCorpusConsolidationSource()` through
the aggregate collector and cleaned up its temporary directory. Exact command:

```sh
bun /tmp/task-657-production-source-probe.ts
```

Output:

```json
{
  "sources": [
    {
      "sourceId": "project-corpus",
      "admitted": 1,
      "omitted": 2,
      "deferred": 0,
      "inventoryComplete": false
    }
  ],
  "warningCount": 1,
  "inventoryPaths": [
    "knowledge/a.md",
    "knowledge/b.md"
  ]
}
```

One valid inventoried record was source-cap-deferred and one malformed record
was unavailable, but `deferred` is zero. The downstream result therefore emits
no aggregate `source-deferred` decline and reports integrity count two.

The committed mixed-case regression does not cover this boundary. Its custom
source returns both valid records, allowing the aggregate collector to perform
the record-cap deferral itself; that local deferral is separable and the test
passes. The counterexample must instead pin a production source, or a conforming
source that applies the supplied limit before returning, and the source snapshot
contract must preserve the causes separately. Safety remains fail-closed, so
this reporting defect is medium rather than high.

## Three-Case Assessment

| Case | Evidence | Assessment |
|---|---|---|
| All cap-deferred | `distinguishes integrity omissions from bounded source deferrals` supplies a complete source with one inventoried omission. It reports `deferred: 1`, one `source-deferred` with `count: 1`, and no integrity decline for that source. | Pass for the isolated complete-source case. |
| All integrity | The same test supplies an incomplete source with one unavailable record. It reports `deferred: 0`, one `source-inventory-incomplete` with `count: 1`, and no bounded decline for that source. | Pass for the isolated integrity-only case. |
| Mixed | `reports cap deferrals and integrity omissions for the same source` passes only when the aggregate collector performs the cap. The production-source probe above applies the cap inside the source and produces `omitted: 2`, `deferred: 0`; downstream reporting suppresses the cap diagnostic and labels both omissions as integrity. | **Fail - SR-014. Neither diagnostic suppressing the other and per-cause accuracy are not proven for the production boundary.** |

## SR-010 Path Parity

SR-010 remains closed. The remediation changes only shared source collection and
result assembly before the deterministic/judgment split. It does not change
either retirement candidate selection or retirement reporting continuation.
The direct regression
`reports pressure-blocked retirements identically with and without model judgment`
passes and compares the full deferred retirement rows plus the filtered
`retirement-pressure-deferred` declines. Both paths still bind candidates before
checking pressure and use the same status, reason, code, path, and bounded cap.

The exact search for `observedRetirementCandidates.length` returned no match
anywhere under `lib/memory/`; the pre-SR-001 slice pattern has not reappeared.

## Parent Ownership, Scope, and Ratified Ground

- All six parent marker/name carriers remain exact and parent-owned: the B-012
  owner in `tests/memory/interface.test.ts`; the B-016 owner plus record-limit
  and byte-limit carriers in `tests/memory/living-memory.test.ts`; and the B-021
  owner plus oversized-metadata carrier in the extension/living-memory suites.
  The focused nine-test selection, including all six carriers, passes.
- `lib/memory/types.ts` hashes to
  `e99b985dc29a5c739189f5744661740d33afb76b0b6e4b786df9e9f8ff62cede`,
  matching all three full-source pins. The receipt-floor, retirement/byte
  authority, fail-closed validation, and existing marker assertions remain and
  pass in the permanent pack.
- Commit `e259b58` changes only `lib/memory/consolidation-sources.ts`,
  `lib/memory/living-memory.ts`, `lib/memory/types.ts`, and mirrored tests
  `tests/memory/interface.test.ts` and `tests/memory/living-memory.test.ts`.
  This review task authors only this new review record. Drive-owned task-state
  edits in `missions/tasks/` are run state and were already present before the
  reviewer authored the record.
- `review-13.md` did not exist before this task and is the next unused integer
  after `review-12.md`. No prior review was overwritten, renamed, or deleted.
- `lib/memory/retirement-store.ts` remains at SHA-256
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.
  The remediation diff contains no retirement-store, pathname, durable-write,
  apply, persist, receipt-write/materialize, finalize, recover, rename, unlink,
  replace, remove, restore, or sync operation change. D-026 is not reopened,
  retirement pathname sequencing is untouched, and no operation is reordered.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. Manual inspection found SR-014; absence of tool
findings is not a passing structural result.

| Gate | Status | Manual evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | The nominal three-case negative controls pass, but the production-boundary probe exposes the missing mixed cause. No executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Inspected the snapshot, aggregate summary, and result reconstruction rather than treating the new count as a single source of truth; their duplicated cause inference produces SR-014. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced both production source collectors, aggregate admission, and failure reporting; the source/aggregate two-level cap structure is not represented by the new field. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact remediation paths, imports, public type pin, parent carriers, D-026 exclusion, and review numbering. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked every new `deferred` and decline `count` producer/consumer within the permitted scope. No repo-wide sweep ran and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: the exact repository-root commands returned
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`
  and 237 files.
- Focused three-case, SR-010 parity, and six-parent-carrier selection: passed,
  3 files and 9 selected tests.
- Complete fidelity, parent-carrier, CLI, and commit-interleaving pack: passed,
  6 files and 139 tests.
- `bun run test`: passed, 263 files and 3,089 tests.
- `bun run lint`: passed.
- `bun run typecheck`: passed.
- `git diff --check`: passed after this review record was written.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity`: passed with
  artifact conformance GREEN: 12 behaviors, 0 issues, and 0 advisories.
- Live corpus guard after review: the exact repository-root commands returned
  the same digest and 237 files.

## Assessment

SR-010 path parity, the parent contracts, D-026 exclusion, operation ordering,
and the permitted boundary remain intact. The isolated all-cap and all-integrity
cases are correctly distinguished, and the committed aggregate-local mixed
fixture also passes.

SR-013 is not closed across the production source boundary. A source-local mixed
case still suppresses a genuine cap deferral and reports the aggregate omitted
count as integrity. One unresolved medium finding therefore remains, so the
zero-high/medium threshold is not met. Open a bounded SR-014 remediation that
preserves per-cause counts in the source snapshot itself, add a production-
boundary mixed counterexample, and perform another fresh structural review.
