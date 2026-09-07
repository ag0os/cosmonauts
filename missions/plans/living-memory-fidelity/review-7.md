# Stage 3 Round 2 Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-647`
- Reviewed range: `c023ffb..02fa4f9` (the complete permitted Stage-3 implementation diff, including the SR-004/SR-005/SR-006 remediation)
- Reviewer context: six of seven parent review fixes introduced a fresh defect. In this plan, Stage 1 remediation introduced SR-001, Stage 2 remediation introduced SR-002 and discharged a live receipt, and Stage 3 review round 1 left one committed-write defect class open at three sites. Fixes in this code reliably introduce regressions, so this review enumerated the complete write surface rather than checking only the three named examples.
- Verdict: **remediation required — one unresolved medium finding; Stage 3 may not close and Stage 4 may not begin**

## Finding

### SR-007 — MEDIUM: exclusive-create sync and cleanup failures can hide the write that already linked the destination

`writeTextExclusive()` links the synced temporary file to the destination at
`lib/memory/durable-files.ts:324`, then syncs the destination directory at
`:325`. Unlike `replaceText()` at `:380-386`, a failure after that link is not
wrapped in `DurableFileCommittedError`. The same untagged escape exists if
temporary-link unlink or its following directory sync throws at `:335-339`
after the destination link has committed.

This bypasses the new write-through adapters rather than reaching them. Receipt
acceptance awaits `acceptedJudgmentReceiptStore.write()` at
`lib/memory/living-memory.ts:667-688` and reports the commit only at `:689`.
Proposal materialization awaits `proposalStore.persist()` inside the adapter at
`:107-113` and likewise reports only after the await returns. Therefore:

- an accepted receipt can exist at its destination while the failed result still
  reports `writesCommitted: false`; and
- a deterministic-only proposal can exist at its destination while the failed
  result still reports `writesCommitted: false`.

The outer catch at `lib/memory/living-memory.ts:934-940` cannot recover the bit
because both failures are ordinary, untagged errors. This is another instance of
the exact class the task requires closed: a durable mutation can occur before a
later throw bypasses the only call that writes its truth into `details`.

The remediation should remain bounded to carrying the already-committed bit out
of `writeTextExclusive()` after the destination link, on the same terms as the
SR-004 `replaceText()` fix. It must not alter link/sync ordering, retirement
pathname sequencing, or D-026 behavior. Add receipt-acceptance and
deterministic-proposal counterexamples that fail after the destination link and
assert both the on-disk destination and `writesCommitted: true`.

## Named Finding Closure

- **SR-004 closed.** `replaceText()` preserves rename-then-sync ordering and
  wraps only the post-rename directory-sync failure as committed
  (`lib/memory/durable-files.ts:380-386`). The materialization adapter consumes
  the tag before rethrowing (`lib/memory/living-memory.ts:115-127`).
- **SR-005 closed for a successful persist followed by later work.** Every
  deterministic and model-backed proposal call uses `persistProposal()`, which
  immediately reports a returned `status: "written"` before another loop
  iteration or phase can throw (`lib/memory/living-memory.ts:107-113`,
  `:453-462`, `:712-719`, `:742-749`). SR-007 covers the still-open case where
  the persist itself throws after linking its destination.
- **SR-006 closed.** Accepted-episode recovery reports each returned prune at
  `lib/memory/living-memory.ts:1118-1122` before receipt materialization at
  `:1143-1145`, so the later failure cannot erase the earlier prune or bit.

## Complete Durable-Write Enumeration

The full current `lib/memory/living-memory.ts` mutation surface was traced as
follows:

| Site | Durable operation | State propagation before later work | Result |
|---|---|---|---|
| `:132-153` | empty retirement apply/recovery | `applyRetirements()` reports returned details at `:101-105`; failed results retain the accumulator | closed |
| `:162-167` | source recovery | returned prunes/bit go directly to `reportCommittedState()` | closed |
| `:270-281` | stale receipt discharge | returned removals report immediately; the receipt store combines prior removals with a thrown committed-removal tag | closed |
| `:308-315`, `:1095-1122` | accepted-episode recovery finalization | every returned prune reports before another source or receipt transition | closed |
| `:1143-1145` | recovered accepted-receipt materialization | routed through the committed-aware materialization adapter | closed |
| `:665-689` | accepted-receipt creation | reports after successful return, but an untagged post-link failure bypasses `:689` | **open: SR-007** |
| `:448-463`, `:707-720`, `:733-780` | deterministic and model proposal creation | successful `written` returns report immediately, but an untagged post-link failure bypasses the adapter | **open: SR-007** |
| `:487-500`, `:781-794` | normal retirement application | routed through `applyRetirements()` and reported before later phases/assembly | closed |
| `:822-851` | normal episode finalization | every returned prune reports before another source or receipt materialization | closed |
| `:853-872` | normal accepted-to-materialized transition | accepted-state precondition plus committed-aware adapter reports success/failure immediately | closed |

`acceptedJudgmentReceiptStore.read()` at `:599-601` performs durability
confirmation of existing bytes but does not create or replace bytes, so it is
not counted as a committed mutation. No direct `durableFiles` write is otherwise
performed by this module.

## Inverse Audit: No False Positive Commit Bit

No inverse-direction high or medium finding was identified in the current
pipeline:

- `reportCommittedState()` is OR-only and ignores empty/false reports
  (`lib/memory/living-memory.ts:85-100`).
- Dry runs skip recovery, discharge, receipt acceptance, finalization, and
  materialization; proposal previews and retirement previews return false.
- Failures before the first durable write retain the initialized false bit.
- The no-selected-record branch returns `noop` only when the accumulated bit is
  false, and returns `ran` when maintenance actually committed.
- The materialization adapter is reached only for an accepted receipt in both
  normal and recovery flows, so its successful return represents the
  accepted-to-materialized durable transition rather than an already-materialized
  no-op.

The selected inverse controls passed for stable/pending/locked/changed dry runs,
request/output validation failures before writes, healthy no-work, recovery-only
work, and incomplete inventory. Under the consolidator's outer lock and the
accepted-state preconditions, no path was found that sets `writesCommitted` true
before or without an actual committed operation.

## Parent Ownership, Boundary, and Ratified Ground

- All six exact parent carrier marker/name pairs remain present: the B-012 owner
  in `tests/memory/interface.test.ts`; the B-016 owner plus record-limit and
  byte-limit carriers in `tests/memory/living-memory.test.ts`; and the B-021
  exact-renderer owner plus oversized-metadata carrier in the extension and
  living-memory suites. The focused selection ran all six exact test names.
- `lib/memory/types.ts` did not change in the reviewed Stage-3 range and remains
  at full-source SHA-256
  `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`.
- Frozen pins, the receipt floor, retirement/byte authority, fail-closed model
  output validation, existing behavior markers, Stage-1 measurement, and the
  Stage-2 completeness barrier remain unweakened.
- The implementation diff is confined to `lib/memory/consolidation-receipts.ts`,
  `lib/memory/durable-files.ts`, `lib/memory/living-memory.ts`, and mirrored
  tests under `tests/memory/`. This review record is TASK-647's sole
  implementation-external addition; generated task-state edits remain
  Drive-owned.
- `lib/memory/retirement-store.ts` is untouched. The `durable-files.ts` change is
  confined to tagging the already-completed receipt replacement after rename;
  rename/sync ordering is unchanged. D-026 was not reopened, re-litigated, or
  given another verification layer, and retirement pathname sequencing was not
  touched.
- `review-7.md` is the next unused integer after `review-1.md` through
  `review-6.md`; no existing review record was overwritten, renamed, or deleted.

## Structural Gate Status

No executable structural-analysis capability was registered in this reviewer
session. Therefore no executable structural evidence exists for any bindable
gate below. The complete permitted diff was inspected by hand. Absence of tool
findings is **not** a passing structural result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Inspected the retained negative controls and found the missing exclusive-create post-link failure class; no executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Enumerated every durable-write call site and the single write-through accumulator by hand; no executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced success, failure, dry-run, no-work, incomplete-inventory, recovery, and accepted-to-materialized state transitions manually. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact implementation paths, inward dependencies, parent carriers, D-012 limit, and forbidden-path exclusions manually. |
| `dead-code` | **degraded/unbound** | Scoped the new adapters/error consumption and performed no repo-wide dead-code sweep; no executable dead-code evidence exists. |

## Verification

The fresh reviewer ran the Stage-1, Stage-2, Stage-3, SR-004/005/006, inverse,
and exact parent-carrier selection:

```sh
bun x vitest run tests/extensions/architecture-memory.test.ts tests/memory/consolidation-sources.test.ts tests/memory/living-memory.test.ts tests/memory/interface.test.ts tests/memory/living-memory-commit-interleavings.test.ts -t 'matches pressure to injection for both round-7 divergence directions|marks pressure unusable instead of reporting a false fit without an exact render input|counts injected knowledge warnings in measured index bytes|marks corpus inventory incomplete when retrieval omits a warned record|keeps receipts and blocks dependent work when corpus inventory is incomplete|counts malformed episodes as omitted incomplete inventory|reports a committed first receipt removal when its directory sync fails|preserves source-recovery episode prunes and committed writes in the final result|reports committed writes for a materialization-only retry pass|reports receipt materialization when its parent-directory sync fails|reports an earlier deterministic proposal when the next persist fails|reports an earlier model proposal when the next persist fails|reports a recovered episode prune when receipt materialization fails|exposes exact living-memory outcomes through configured knowledge consolidate only|rehydrates accepted judgment and persisted evidence then converges to noop|retains a live receipt when a later pass exhausts its record limit|retains a live receipt when a later pass exhausts its byte allowance|measures index pressure with the exact injection renderer and budget|measures oversized corpus metadata exactly as combined-context injection|previews only a stable snapshot and observes pending recovery without mutating it|rejects an oversized serialized judgment request before dispatch|rejects oversized model output before writing a receipt or proposal'
```

Result: **pass**, 5 files; 22 selected tests passed and 101 were skipped.

Task-boundary checks also passed:

- `bun run test` — 263 files, 3,071 tests passed.
- `bun run lint` — 580 files checked, no fixes.
- `bun run typecheck` — passed.
- `git diff --check` — passed.

The live corpus guard before and after review remained 237 files at tree SHA-256
`adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`.

## Assessment

SR-004, SR-005, and SR-006 are closed, and the inverse paths do not over-report
writes. The complete enumeration nevertheless found SR-007, another member of
the under-reporting class at both accepted-receipt and proposal exclusive-create
sites. Stage 3 therefore remains open. Start a bounded Stage-3 RED/GREEN/refactor
remediation for SR-007, then perform another fresh structural review before
Stage 4 begins.
