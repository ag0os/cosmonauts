# Codex Round Fresh Structural Review: materialization commit reporting

- Date: `2026-09-08`
- Task: `TASK-661`
- Remediation commit: `27a8cc7` (`ff78d04..27a8cc7`)
- Review scope: the complete CDX-001/CDX-002 remediation, every consolidation
  operation that contributes to `MemoryConsolidateDetails.writesCommitted`,
  the durable primitives beneath those operations, the Stage-2/3/4 regression
  seams, the permanent fidelity/parent pack, and the permitted boundary.
- Verdict: **remediation required - four unresolved medium findings; the plan
  cannot close**

## Findings

### SR-015 - MEDIUM - A same-content proposal winner is reported as this pass's write

- Dimension: committed-write overstatement / proposal result contract
- Ratified ground: D-004, INV-003, Quality Contract assertions 4 and 8
- Code: `lib/memory/consolidation-proposals.ts:85-132`,
  `lib/memory/durable-files.ts:316-368`, and
  `lib/memory/living-memory.ts:107-113`

`persist()` checks for an existing proposal before calling the exclusive
durable writer. If an identical proposal appears between that check and the
destination link, `writeTextExclusive()` handles `EEXIST`, verifies the winner
bytes, and returns successfully with `destinationLinked === false`. The
proposal store nevertheless returns `status: "written"`, and the consolidator
maps that status to `writesCommitted: true`. The successful primitive return
does not say whether this invocation published the destination.

An isolated production-store probe injected the real durable writer behind a
wrapper that first installed the identical winner, then performed the pass's
write. The inode was unchanged by the second call, proving that call was a
no-op, while `persist()` returned `status: "written"`. This is the same
success-implies-commitment shape as CDX-001. The operation that owns publication
must carry whether it linked the destination; the caller cannot infer that from
success or from the final bytes.

### SR-016 - MEDIUM - Accepted-receipt creation still treats every return as a commit

- Dimension: committed-write overstatement / receipt result contract
- Ratified ground: D-004, INV-003, Quality Contract assertions 4 and 8
- Code: `lib/memory/consolidation-receipts.ts:184-213`,
  `lib/memory/durable-files.ts:316-368`, and
  `lib/memory/living-memory.ts:684-709`

`AcceptedJudgmentReceiptStore.write()` has two successful no-write paths: its
own pre-read returns an identical receipt at `:193-204`, and the exclusive
writer can lose an identical publication race at `durable-files.ts:346-355`.
Both paths return the same receipt as a real publication. The consolidator then
unconditionally calls `reportCommittedState({ writesCommitted: true })` after
any successful `write()` return.

This is a direct sibling of the repaired materialization defect. The initial
`read(input.batchKey)` can observe absence, another actor can publish the
receipt before `write()`, and this pass then reports a write it did not make.
An isolated production-store probe reproduced the lower race: the second real
durable call preserved the winner inode, but `write()` returned no commit bit
with which the caller could distinguish it. Receipt creation must carry the
store-owned bit just as materialization now does.

### SR-017 - MEDIUM - Stale discharge equates returned paths with successful removals

- Dimension: committed-write overstatement / receipt discharge contract
- Ratified ground: D-004, INV-003, Quality Contract assertions 4 and 8
- Code: `lib/memory/consolidation-receipts.ts:100-160`,
  `lib/memory/durable-files.ts:185-199`, and
  `lib/memory/living-memory.ts:278-289`

`durableRemove()` deliberately absorbs `ENOENT` and returns successfully without
mutation. `dischargeStale()` appends the receipt path after that successful
return, and the consolidator derives commitment from
`dischargedReceipts.length > 0`. If another actor removes a receipt after the
stale list is built but before this pass's removal, the primitive returns from
its no-op branch, the store returns the path, and this pass reports committed.

An isolated production-store probe removed the stale receipt immediately
before the pass's real `removeFile()` call. The second call took the `ENOENT`
no-op path, yet `dischargeStale()` returned the receipt path. The path list is a
domain outcome, not a write receipt. The store must separately carry its actual
commit bit; array length is not equivalent once the primitive is idempotent.

### SR-018 - MEDIUM - Episode recovery marks an already-removed journal as this pass's commit

- Dimension: committed-write overstatement / source recovery contract
- Ratified ground: D-004, INV-003, Quality Contract assertions 4 and 8
- Code: `lib/memory/consolidation-sources.ts:605-660` and
  `lib/memory/durable-files.ts:185-199`

`recoverEpisodePruneJournal()` reads a journal, calls the no-op-capable
`removeFile()`, and assigns `writesCommitted = true` solely because the call
returned. If another actor removes the journal between the read and that call,
the primitive absorbs `ENOENT`; recovery nevertheless returns true. The same
pattern also exists after `restoreFile()`, whose already-restored branch returns
without a mutation at `durable-files.ts:262-270`.

An isolated production-source probe used a valid journal with no tombstone and
a still-live episode. A wrapper removed the journal immediately before the
source's real removal. The pass's removal was a proven no-op, `episodePrunes`
was empty, and recovery still returned
`{ episodePrunes: [], writesCommitted: true }`. The consolidator correctly
carries the source result; the overstatement originates inside the operation
that constructs that result.

## CDX-001 Materialization Assessment

The named remediation is correct in both directions.

- `markMaterialized()` now returns one object containing the receipt and the
  store-owned `writesCommitted` bit. Its already-materialized branch returns
  false; its accepted-to-materialized branch returns true only after the real
  `replaceText()` completes.
- `markReceiptMaterialized()` passes `materialization.writesCommitted` into the
  single OR-only accumulator. It no longer infers commitment from a successful
  return or from the returned receipt state.
- A competing-materialization full-pass regression reports false. The real
  materialization-only retry reports true. The production-store direct test
  observes true for the first transition and false for the repeat.
- The throw-after-write regression passes: a failure syncing the receipt parent
  after destination rename remains structurally tagged and the failed pass
  reports `writesCommitted: true`.

CDX-001 is closed at its named seam. SR-015 through SR-018 show that the defect
class is not yet closed elsewhere.

## Durable-Write Call-Site Enumeration

The enumeration starts at every operation whose result can affect the
consolidator's committed bit and follows each operation to its primitive. It
does not treat a criterion, prior review, or green test as evidence that the
inverse branch was inspected.

| Consolidation seam | Operation-owned result | Primitive/no-op assessment | Verdict |
|---|---|---|---|
| Retirement recovery and application through `applyRetirements()` | `LivingMemoryRetirementRunDetails.writesCommitted` | The consolidator carries the store's bit and performs no caller inference. `lib/memory/retirement-store.ts` internals remain excluded by D-012. | caller safe |
| Source recovery | `{ episodePrunes, writesCommitted }` | The consolidator carries the source bit, but episode journal recovery sets it after no-op-capable remove/restore returns. | **SR-018** |
| Stale receipt discharge | path array | The store pushes after no-op-capable `removeFile()` and the caller maps non-empty length to true. | **SR-017** |
| Accepted receipt creation | receipt only | The store can return an existing identical receipt; the caller maps every successful return to true. | **SR-016** |
| Proposal persistence | `preview | existing | written` status | The caller consumes the status, but the producer labels an identical `EEXIST` winner `written` after a no-op primitive return. | **SR-015** |
| Normal source finalization and accepted-episode recovery | `ConsolidationSourceFinalization` at both callers | Both callers carry `finalized.writesCommitted`; neither derives it from `episodePrunes`. A normal new prune records the journal `replaceText()` first. The producer inherits SR-018 only when it begins with recovery. | caller safe; producer defect already counted |
| Receipt materialization | `{ receipt, writesCommitted }` plus committed error tag | False for an existing materialized receipt, true for real replacement, and true on post-rename failure. | CDX-001 closed |
| Outer caught errors and lock-release failures | structural error tag or accumulated details | OR-only; no successful return is converted into commitment here. | safe |

The underlying primitive inventory explains the false positives:

- `writeTextExclusive()` may return after an already-identical file or an
  identical `EEXIST` winner without publishing the destination.
- `durableRemove()` may return after `ENOENT` without unlinking anything.
- `durableRestore()` may return from the already-restored branch without a new
  mutation. Its same-inode `EEXIST` branch is different: it delegates source
  removal and therefore can mutate.
- `durableLink()` may return for the same inode without creating a link, but it
  is used only inside the D-012-excluded retirement store for this plan.
- Successful `replaceText()` and `durableRename()` always cross their rename
  mutation point; post-mutation failures retain the structural committed tag.

Unrelated knowledge writes, improve-resolution writes, ordinary memory-store
writes, and retirement-store internals do not contribute directly to this
consolidation result and are outside this committed-bit review. This boundary
does not reopen D-026 or `lib/memory/retirement-store.ts`.

## CDX-002 Public-Surface Assessment

`ConsolidationSourceFinalization` is exported from the
`./consolidation-sources.ts` public block beside
`ConsolidationFinalizedRecord`, `ConsolidationSource`, and the other source
contract siblings. The interface test imports and names it from
`lib/memory/index.ts`.

The other named public contract introduced by this plan,
`KnowledgeIndexRenderInput`, is exported from the `./types.ts` block, and the
plan-introduced `KNOWLEDGE_INDEX_RETRIEVAL` value is exported from the
`./knowledge-records.ts` block. Changes to existing source snapshot, collected
source, pressure-result, and receipt-store contracts remain reachable through
their already-exported names. No other plan-introduced public type is missing
from the barrel.

## Regression and Ratified-Ground Assessment

- **SR-010 path parity:** the exact pressure-blocked retirement row/status/
  reason/code comparison passes in deterministic and judgment modes. The
  materialization remediation changes neither continuation.
- **SR-011 through SR-014 cause separation:** the production all-cap,
  all-integrity, mixed corpus, and mixed episode selections pass. Source-local
  `deferred` remains carried through aggregate and result boundaries; neither
  diagnostic suppresses the other.
- **Stage-2 completeness barrier:** the incomplete-corpus regression passes.
  The barrier remains before stale discharge, represented-evidence/no-work
  conclusions, judgment/proposal materialization, source finalization, and
  non-empty retirement application, while prior recovery details survive.
- **Stage-3/4 understating direction:** first-removal, earlier-proposal,
  source-recovery, empty-prune finalization, receipt materialization, and
  complete interleaving tests remain green. The remediation changes no source,
  proposal, retirement, or durable-file operation and moves no call. The four
  findings above are inverse overstatements, not regressions in those retained
  under-reporting paths.
- All six exact parent marker/name carriers remain exact and parent-owned: the
  B-012 public-consolidate owner; the B-016 convergence owner plus record-limit
  and byte-limit carriers; and the B-021 exact-renderer owner plus
  oversized-metadata carrier. Their selected tests pass.
- `lib/memory/types.ts` hashes to
  `149163921b7a6079d09c8592f464d7e7d969432e7028c2a3486cc3b05cd53c01`,
  matching all three same-commit pins. Receipt-floor, retirement/byte
  authority, fail-closed validation, and existing behavior-marker checks
  remain present and pass.

## Parent Ownership, Scope, and D-026

- Commit `27a8cc7` changes only `lib/memory/consolidation-receipts.ts`,
  `lib/memory/index.ts`, `lib/memory/living-memory.ts`, `lib/memory/types.ts`,
  and mirrored tests under `tests/memory/`. This task authors only this plan's
  review record. Drive-owned task-state edits under `missions/tasks/` predate
  the record and are run state, not reviewer-authored implementation scope.
- `review-15.md` was absent before this task and is the next unused integer
  greater than every existing review number. No prior review was overwritten,
  renamed, or deleted.
- `lib/memory/retirement-store.ts` is byte-identical to the remediation parent
  at SHA-256
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.
  The remediation adds, removes, or reorders no durable apply, persist,
  receipt, source-finalization, rename, unlink, restore, or sync operation.
  Retirement pathname sequencing is untouched and D-026 is not reopened.

## Structural Gate Status

No executable structural-analysis capability is registered in this reviewer
session. Therefore **no executable structural evidence exists** for any of the
five bindable gates below. Every status is **degraded/unbound**, never clean;
manual source inspection and test/probe evidence do not convert an unbound gate
into a passing structural-analysis result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Traced every consolidator mutation contributor through its producer and idempotent primitive; four isolated inverse probes reproduced SR-015 through SR-018. No executable mutation-analysis evidence exists. |
| `duplication` | **degraded/unbound** | The single OR-only accumulator remains, but four producers reconstruct commitment from status, path count, or successful return instead of carrying primitive-owned facts. No executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced dry-run, recovery, completeness, receipt, proposal, finalization, materialization, success, no-op, and throw-after-write branches manually. No executable complexity evidence exists. |
| `boundary-conformance` | **degraded/unbound** | Inspected the exact remediation paths, public exports, import direction, parent carriers, D-012 exclusion, D-026 exclusion, and review numbering. No executable boundary evidence exists. |
| `dead-code` | **degraded/unbound** | Checked the changed result shape, all materialization consumers, source-finalization consumers, and plan-introduced public names within the permitted boundary. No repo-wide sweep ran and no executable dead-code evidence exists. |

## Verification

- Live corpus guard before review: the exact repository-root commands returned
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`
  and 237 files.
- Focused materialization, throw-after-write, SR-010, SR-011..SR-014,
  Stage-2, public-export, and six-parent-carrier selection: passed, 4 files and
  15 selected tests.
- Four isolated production-adapter probes: passed. They demonstrated an
  unchanged inode with proposal status `written`, an unchanged inode with no
  receipt-write commit result, a returned stale path after an `ENOENT` no-op,
  and `{ episodePrunes: [], writesCommitted: true }` after an `ENOENT` journal
  no-op. The temporary probe file was removed after execution.
- `bun run test`: passed on the final exact run, 263 files and 3,092 tests. The
  first full run had one transient failure in
  `tests/plans/archive.test.ts`: its git-status assertion received
  `?? .cosmonauts/episode-task-TEST-001.lock.<pid>.<uuid>.tmp`, followed by an
  `ENOTEMPTY` cleanup error. The exact isolated retry passed, 1 selected test,
  and the second exact full run passed including that test.
- `bun run lint`: passed, 580 files checked with no fixes.
- `bun run typecheck`: passed.
- `bun bin/cosmonauts plan check-artifacts living-memory-fidelity`: passed with
  artifact conformance GREEN: 12 behaviors, 0 issues, and 0 advisories.
- `git diff --check`: passed after the review record was finalized.
- Live corpus guard after review: the exact repository-root commands returned
  the same digest and 237 files.

## Closing Assessment

CDX-001 and CDX-002 are fixed at their named seams, both materialization
directions are executable, and the earlier path-parity, cause-separation,
completeness, parent-ownership, and under-reporting regressions remain green.
The required class-level review nevertheless found four more places where
success or a lossy proxy is treated as proof that this pass committed durable
state.

There are four unresolved medium findings. The zero-high/medium threshold is
not met, so this plan cannot close. A bounded remediation must carry actual
commit facts from the operations that own proposal publication, receipt
creation/discharge, and episode recovery, then receive another fresh structural
review under D-006.
