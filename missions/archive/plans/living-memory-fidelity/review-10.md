# Stage 4 Round 2 Final Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-651`
- Reviewed range: `0493e54^..4ffacdd` (the complete permitted Stage-0 through
  Stage-4 implementation remediation, including every SR-001 through SR-008
  round)
- Reviewer context: the complete seven-round parent trajectory in
  `missions/plans/living-memory/review-rounds.md` and every verdict in
  `review-2.md` through `review-9.md` were supplied and read before reviewing
  the implementation. Six of seven parent fixes introduced a fresh defect, and
  this plan required eight findings across four stages. This review therefore
  independently enumerated the current write sequences and checked both
  directions of the committed-write contract rather than trusting TASK-650's
  notes or following only green tests.
- Verdict: **remediation required - one unresolved medium finding; the final
  scope audit and handoff may not proceed**

## Finding

### SR-009 - Successful empty-prune finalization loses committed journal work at the source-result boundary

- Severity: **medium**
- Dimension: committed-write monotonicity / source result contract
- Ratified ground: D-004, INV-003, Quality Contract assertion 4,
  Implementation Order step 20
- Code: `lib/memory/consolidation-sources.ts:119-125`,
  `lib/memory/consolidation-sources.ts:448-549`,
  `lib/memory/living-memory.ts:832-849`, and
  `lib/memory/living-memory.ts:1104-1121`

The production episode finalizer can complete durable maintenance while
returning an empty prune array. In the tombstone-boundary rewrite path, it
durably replaces the episode-prune journal, renames the live episode to its
tombstone, restores the changed tombstone to the live path, removes the
journal, and returns `[]`. TASK-650 correctly records the journal commit in the
finalizer's local `writesCommitted` bit, but that bit is used only to tag a
later thrown error. `ConsolidationSource.finalize()` still returns only a path
array on success.

Both consumers reconstruct committed state from that lossy array:

- the normal finalization loop reports `writesCommitted: finalized.length > 0`;
- accepted-episode recovery reports `writesCommitted: pruned.length > 0`.

A production two-pass temporary-directory probe isolated the recovery consumer.
Pass one persisted the accepted receipt and proposal and stopped before source
finalization. On pass two, the real finalizer encountered a human rewrite at
each tombstone boundary and completed the journal/rename/restore/cleanup
sequence without pruning either episode. The command was
`bun -e '<inline two-pass probe using createDurableMachineFiles(), createProjectEpisodeConsolidationSource(), createAcceptedJudgmentReceiptStore(), createConsolidationProposalStore(), and createLivingMemoryConsolidator()>'`.
Its exact output was:

```text
{"interrupted":{"kind":"failed","writesCommitted":true},"racedCount":2,"result":{"kind":"ran","writesCommitted":false,"episodePrunes":[]},"journalExists":false,"allLiveRestoredToChangedBytes":true}
```

The existing test `restores an episode rewritten at the tombstone boundary`
already proves that the production source performs this successful sequence and
returns `[]`, but it calls `source.finalize()` directly and does not assert the
full consolidator result. The new probe shows the missing downstream truth.

This is a fifth component of the same class: the successful source-finalization
result/caller boundary. SR-008's two reported error windows are closed, but the
committed-write sweep is **not complete across every module in scope**. A
bounded remediation should carry both `episodePrunes` and `writesCommitted`
through the successful finalization result and consume that state at both
caller sites. Its counterexample must use the production finalizer through the
full consolidator, verify the journal/rename/restore/cleanup sequence, and
require `writesCommitted: true` with an empty prune list. Deriving truth from
the list length again would preserve the defect.

## SR-008 Closure and Consolidation-Module Enumeration

SR-008 itself is closed. The journal commit is recorded immediately after
`replaceText()` and before the episode rename. Recovery records a successful
restore before attempting journal removal. The retained full-consolidator
counterexamples pass and report `writesCommitted: true` for both the
journal-before-rename failure and restore-before-journal-removal failure.

The task's sequence list was checked against the current files rather than
accepted as task evidence. The independent enumeration is:

### `lib/memory/consolidation-sources.ts`

1. Proposal `writeText()` is durability confirmation of bytes just read as
   identical. It publishes no new domain state on success; primitive-internal
   mutation failures retain their structural committed tag.
2. Finalize journal `replaceText()` records the local commit immediately after
   return, before rename, verification, restore, or cleanup. A mutation-then-
   failure inside the primitive is already tagged.
3. Finalize episode-to-tombstone `renameFile()` runs after the journal bit is
   recorded, and the primitive tags its own post-rename failure.
4. Finalize verified tombstone removal through `removeEpisodeFile()` runs with
   the earlier journal bit retained; the helper also tags an ordinary error
   when absence proves removal occurred.
5. Finalize `restoreFile()` after failed tombstone verification runs with the
   earlier journal bit retained, so later failure is tagged. On successful
   empty-prune completion, however, SR-009 loses that bit at the array-only
   result boundary.
6. Finalize journal `removeFile()` likewise runs after the journal bit is set;
   SR-009 is the successful-result propagation gap, not another local ordering
   gap.
7. Recovery verified-tombstone removal records committed state immediately
   after successful return; within-call post-removal failures are tagged by the
   helper or primitive.
8. Recovery `restoreFile()` records committed state immediately after return,
   before journal cleanup. The former `:601`/`:607` candidate is therefore
   resolved for its named later-failure interleaving.
9. Recovery journal `removeFile()` records committed state immediately after
   return, before the live-path read and result assembly.
10. Shared `removeEpisodeFile()` delegates to committed-aware durable removal
    and converts confirmed post-removal ordinary errors into
    `ConsolidationSourceCommittedError`.

No source operation was reordered. The local error paths are monotonic. The
enumeration exposes SR-009 because the locally recorded success bit is absent
from the finalizer's success contract.

### `lib/memory/consolidation-receipts.ts`

1. `dischargeStale()` appends each successful removal immediately. A later
   removal failure combines prior removals with the current error's committed
   tag. TASK-650 also carries the completed removal set through an unconfirmed
   inner-lock release; zero removals keep the wrapper false.
2. `read()` uses `writeText()` only to confirm durability of an identical
   existing receipt. It creates no new receipt state on success; a primitive
   mutation-then-failure remains tagged.
3. `write()` performs `writeSafeExclusiveText()` and immediately returns the
   precomputed normalized receipt. No throwable operation follows the write.
4. `markMaterialized()` validates and constructs the next receipt before
   `replaceText()`. After the current line 231 (the task's former line 228), it
   executes only `return next`; nothing can throw between the durable write and
   its return. Primitive post-mutation failures carry the committed tag.

The receipt-module enumeration is complete, and no further local
under-reporting sequence was found there.

## Earlier Sweep Confirmation and Inverse Direction

The current `lib/memory/durable-files.ts` operation inventory from `review-8.md`
was independently rechecked. Destination link, unlink, rename, and restore
mutations are tagged only after their mutation point; exclusive-create cleanup
is tagged only when destination publication occurred. Pre-publication staging
cleanup remains untagged. A whitespace-normalized comparison of every
`mkdir`/`link`/`unlink`/`rename`, delegated remove, temp-write, and directory-
sync call between `c023ffb` and the current file is identical, confirming that
the tagging work did not reorder operations.

The current `lib/memory/living-memory.ts` retains one OR-only
`reportCommittedState()` accumulator. Retirement results, successful proposal
writes, accepted receipts, materialization, returned source recovery, returned
source finalization, and structurally tagged errors all flow through it before
later work. No reconstruction resets a true bit. SR-009 is narrower: the source
success result omits a true bit before the accumulator can consume it.

The inverse audit found no high or medium false-positive committed report in
the plan's supported paths:

- dry runs do not call source recovery/finalization, receipt discharge/write/
  materialization, live retirement, or non-preview proposal persistence;
- request/output validation failures before a write retain the initialized
  false bit;
- healthy no-work and repeat/noop paths return `writesCommitted: false`;
- an exclusive-create different-byte `EEXIST` identity conflict leaves
  `destinationLinked` false, preserves the winner, and carries no committed
  tag;
- no-op durable-link same-inode, durable-remove `ENOENT`, and already-restored
  durable-restore branches do not synthesize a primitive tag.

The selected dry-run, pre-write failure, noop, outer-lock failure, and identity-
conflict controls all passed. SR-009 is an under-report only; TASK-650 did not
introduce a reviewed-path over-report.

## Complete Plan Diff, Parent Ownership, and Ratified Ground

- The complete implementation range has one canonical knowledge-index
  descriptor, one required records-plus-warnings render input, one renderer,
  and no `toIndexRecords` or second retrieval. Injection, pressure, the corpus
  source, and real CLI composition retain the same projection.
- Corpus warnings and malformed episodes preserve inventory evidence and make
  aggregate completeness false. Explicit custom-source inventory coverage is
  validated, warnings append monotonically, and the fail-closed barrier still
  precedes discharge, represented-evidence conclusions, proposal/receipt work,
  episode finalization, and non-empty retirement application.
- All twelve fidelity marker/name owners and all six exact parent carrier
  marker/name pairs remain present. The B-012 owner is in
  `tests/memory/interface.test.ts`; the B-016 owner plus record/byte-limit
  carriers are in `tests/memory/living-memory.test.ts`; the B-021 exact-renderer
  owner and oversized-metadata carrier remain in the extension and living-
  memory suites.
- `lib/memory/types.ts` hashes to
  `d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea`, matching
  all frozen source pins. The receipt floor, retirement/byte authority,
  fail-closed output validation, and existing markers remain unweakened.
- The implementation diff is confined to `lib/memory/`,
  `lib/extensions/knowledge-surface/`, and mirrored tests under `tests/`; the
  Stage-4 CLI composition work changed only its mirrored test. D-012's recorded
  `knowledge-store.ts` and durable-file amendments remain within their exact
  authorization.
- `lib/memory/retirement-store.ts` is byte-unchanged across the complete plan
  range. Retirement pathname sequencing is untouched. D-026 was neither
  reopened, re-litigated, nor given another verification layer.
- `review-10.md` was absent before this task and is the next unused integer
  after `review-9.md`. No existing review was overwritten, renamed, or deleted.
- Drive-owned TASK-650/TASK-651 state changes are separate run state. This
  reviewer authored no production or test change and ran no non-dry live-memory
  command.

## Structural Gate Status

No executable structural-analysis capability was registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. The complete permitted diff was inspected by hand.
Absence of tool findings is **not** a passing structural result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Rechecked every consolidation-source/receipt durable sequence, the primitive mutation inventory, caller folds, and inverse controls; SR-009 was found at the successful source-result boundary. No executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Checked the canonical query/render path, single committed-state accumulator, source/receipt adapters, and removed legacy call forms manually. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced measurement, completeness, dry-run, no-work, recovery, finalization, materialization, release, cleanup, success, and failure paths manually. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the complete Stage-0..4 path list, import direction, parent carriers, type pin, D-012 amendments, D-026 exclusion, and review numbering manually. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked changed exports, helpers, result shapes, adapters, and consumers within the permitted diff only. No repo-wide sweep was run and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: SHA-256
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`,
  237 files, using the exact two repository-root commands in Implementation
  Order step 1.
- Permanent measurement pack: passed, 2 files and 5 tests.
- Complete fidelity B-001..B-012 and all six exact parent B-012/B-016/B-021
  carriers: passed, 5 files and 18 selected tests.
- Committed-interleaving and inverse-direction selection: passed, 2 files and
  19 selected tests (all 11 interleaving tests plus the targeted source,
  dry-run, pre-write, noop, and lock controls).
- The production temporary-directory SR-009 probe reproduced the finding with
  the exact output recorded above and cleaned its temporary root.
- `bun run test` - passed, 263 files and 3,082 tests.
- `bun run lint` - passed, 580 files checked with no fixes.
- `bun run typecheck` - passed.
- `git diff --check` - passed.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity` - passed,
  12 behaviors, 0 issues, and 0 advisories.

One preliminary version of the optional inline probe completed its scenario but
used an unavailable output helper. The actual command was
`bun -e '<inline temporary-directory probe ending in text(JSON.stringify(...))>'`
and exited 1 with:

```text
ReferenceError: text is not defined
Bun v1.2.22 (macOS arm64)
```

It touched only its temporary directory, which its `finally` block removed. The
corrected `console.log()` probe then produced the SR-009 evidence above. This
probe-harness error did not affect any required gate.

## Assessment

SR-008 is closed at both named failure interleavings, and its recovery candidate
and the receipt line-228 candidate are resolved as required. The measurement,
completeness, warning, parent-ownership, durable-primitive, ordering, boundary,
and inverse-direction contracts otherwise remain coherent and all executable
gates pass.

The committed-write sweep is nevertheless not complete. SR-009 loses successful
empty-prune source maintenance before the OR-only accumulator, so the ratified
zero-high/medium threshold is not met. Open another bounded committed-write
remediation with a production full-consolidator counterexample, then perform a
different fresh final structural review before the final scope audit or handoff.
