---
id: TASK-648
title: 'Stage 3 round 3: Tag committed writes in the durable-file primitives'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:living-memory-fidelity'
dependencies:
  - TASK-646
createdAt: '2026-09-07T23:35:40.459Z'
updatedAt: '2026-09-07T23:51:41.735Z'
---

## Description

Bounded Stage-3 remediation round 3, opened by finding SR-007 (medium) in
`missions/plans/living-memory-fidelity/review-7.md` (TASK-647). SR-004, SR-005 and
SR-006 are confirmed closed. Stage 3 may not hand off to Stage 4 until SR-007 is
closed and a fresh review passes.

SR-007, independently confirmed against the code. `writeTextExclusive()` links the
synced temporary file to its destination at `lib/memory/durable-files.ts:324` — the
destination bytes exist from that moment — then syncs the destination directory at
`:325`. The surrounding catch at `:326-332` rethrows any non-`EEXIST` error raw, so a
sync failure escapes untagged. The `finally` at `:335-340` has the same escape: after
a successful destination link, a throwing `unlink` of the temporary or its following
directory sync propagates untagged and overrides the successful return.
`replaceText()` wraps exactly this window in `DurableFileCommittedError` at
`:382-386`; `writeTextExclusive()` does not.

Why TASK-646's fix cannot reach it: `reportCommittedState()` runs after an awaited
store call returns. These failures occur *inside* the awaited call, so control never
reaches the report. An accepted receipt or a deterministic proposal can therefore
exist at its destination while the failed result reports `writesCommitted: false`.

Close the class at this level rather than the two named sites alone. Audit every
byte-mutating operation in `lib/memory/durable-files.ts` for the same shape — a
durable mutation followed by an operation that can throw untagged before the function
returns — and for each either tag it or record in the task notes why it is already
safe. Enumerate them explicitly so the fresh review can check the enumeration rather
than repeat it.

Hard bounds, from D-012's narrow authorization and D-026's ratified ground:
**error tagging only.** Do not reorder any operation in `durable-files.ts`, do not
change what is synced or when, do not alter link/rename/unlink sequencing, and do not
touch retirement pathname sequencing or `lib/memory/retirement-store.ts`. If closing
a site appears to require an ordering change, halt and escalate rather than making it.

Also close the coverage gap this round inherits: the `:640`-class path — an accepted
receipt written durably, then fail-closed `validateJudgmentOutput()` throwing before
the pass completes — is correctly handled by TASK-646's fix but is pinned by no test.
Moving `reportCommittedState` back below the validator would silently reintroduce it
with the suite green.

Ratified-ground handling: the five common constraints below and the spec Intent
invariants INV-001..INV-004 are stop-and-escalate ground under the deviation
protocol. INV-003 is the invariant SR-007 violates.

<!-- AC:BEGIN -->
- [x] #1 (Quality Contract assertion 7; Implementation Order steps 2 and 21) Directory boundary: the task's working diff touches only `lib/memory/`, `lib/extensions/knowledge-surface/`, `cli/memory/` and their mirrored tests under `tests/`. No repo-wide dead-code sweep, no export demotion, no unrelated API cleanup, no documentation, configuration, architecture-record or parent-plan edit. A prior remediation task without this criterion went 18 files wide and was fully reverted.
- [x] #2 (Quality Contract assertion 6; Implementation Order step 1) Live corpus guard: before and after the task, `find knowledge -type f | sort | xargs shasum -a 256 | shasum -a 256` run from the repository root reports `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932` and `find knowledge -type f | wc -l` reports 237. The relative `knowledge` root is load-bearing. No task may modify, move or delete anything under live `knowledge/`, and no task may run a live retirement round or any non-dry-run write-capable memory command against it.
- [x] #3 (Quality Contract assertions 5 and 7; Implementation Order step 2) Parent ownership: the parent markers `@cosmo-behavior plan:living-memory#B-012|B-016|B-021` and their plan-declared test names remain exact and parent-owned across all six carrier tests enumerated in the plan's Architecture Context. No frozen pin, receipt floor, retirement/byte authority, fail-closed model-output validation or existing behaviour marker is weakened or removed. Any commit changing `lib/memory/types.ts` re-pins its full-source SHA-256 in the profile-playbooks seam test in the same commit.
- [x] #4 (Quality Contract assertion 7; Implementation Order steps 13-15) Gates: `bun run test`, `bun run lint`, `bun run typecheck` and `git diff --check` all pass at the task's commit boundary. No test is committed red.
- [x] #5 (Quality Contract assertions 7-8; Implementation Order step 21; D-026) D-026 is not reopened, re-litigated, or given another verification layer, and retirement pathname sequencing in `lib/memory/retirement-store.ts` is not touched. No operation anywhere in `lib/memory/durable-files.ts` is reordered; this task changes error tagging only.
- [x] #6 (SR-007; INV-003) A RED counterexample reproduces SR-007 before any production edit: `writeTextExclusive()` links its destination and the following destination-directory sync then fails with a non-EEXIST error. The failed consolidate result is shown to report `writesCommitted: false` while the receipt or proposal exists at its destination. After the fix that result reports `writesCommitted: true`.
- [x] #7 (SR-007) A second RED counterexample covers the `finally` window: after a successful destination link, the temporary unlink or its following directory sync throws. The already-committed destination write is reported rather than hidden, and the successful return is not silently overridden by the cleanup failure.
- [x] #8 (SR-007; class closure) Every byte-mutating operation in `lib/memory/durable-files.ts` is enumerated in the task notes with, for each, either the tagging applied or the reason it is already safe. No durable mutation remains followed by an operation that can throw untagged before the function returns.
- [x] #9 (inherited coverage gap) A test pins the receipt-written-then-fail-closed-validation path: `acceptedJudgmentReceiptStore.write()` succeeds and `validateJudgmentOutput()` then throws a plain untagged Error. The result must report `writesCommitted: true`. This is correct today via TASK-646's fix but currently unpinned, so the test must fail if `reportCommittedState` is moved back below the validator.
- [x] #10 (INV-003, inverse direction) The fix does not make `writesCommitted` true when nothing was durably written — in particular on dry-run paths, on failures before any link or rename, and on the no-work/noop path. An EEXIST identity-conflict that writes nothing new must not report a commit.
- [x] #11 (Quality Contract assertions 1-4) The Stage-1 measurement contract, the Stage-2 completeness barrier and warning append-only monotonicity are preserved unweakened. After the fix the Stage-1 pack (B-001..B-003), Stage-2 pack (B-004..B-006), Stage-3 pack (B-007/B-008/B-012), the commit-interleaving tests and the exact parent B-012/B-016/B-021 carrier tests all pass.
<!-- AC:END -->

## Implementation Notes

Implementation evidence (2026-09-07):

TDD evidence:
- RED accepted-receipt post-link sync: the destination receipt existed and the failed result reported writesCommitted false; after tagging the post-link error it reports true.
- RED proposal cleanup: the destination proposal existed after temporary unlink failed and the failed result reported writesCommitted false; after tagging cleanup errors reached after a successful link it reports true.
- RED primitive audit cases: durableLink, durableRename, and the newly-linked durableRestore branch each left the destination present while throwing an untagged sync error; each now throws the structural committed-write tag without moving any filesystem operation.
- The inherited receipt-written then fail-closed validation regression is pinned: the receipt write returns, the second validation rejects unknown input evidence with a plain Error, and the final failed result retains writesCommitted true.
- The inverse EEXIST race is pinned: a competing exclusive-write destination appears before link, identity differs, destination bytes remain the winner, and the error has no writesCommitted tag.

Complete lib/memory/durable-files.ts mutation enumeration:
1. ensureDirectory mkdir: creates directory metadata, not file bytes or a living-memory content/lifecycle record; its later lstat and sync checks do not follow a committed byte write, so no committed-write tag applies.
2. assertRemovalSupported probe link/unlink: mutates only a private temporary capability probe, never source bytes or a domain destination; failures deliberately become DurableRemovalUnsupportedError and best-effort cleanup removes probe residue, so no living-memory committed-write tag applies.
3. durableLink link: a successful new destination link is recorded by linked and any following destination-directory sync failure is tagged. The EEXIST same-inode path creates nothing and its later sync remains untagged.
4. durableRemove unlink: already safe; removed is set only after a real unlink, and the following directory-sync failure is tagged. ENOENT creates no mutation and stays untagged.
5. durableRename rename: the only later operation is the same-directory sync; that failure is now tagged after the successful rename.
6. durableRestore link/unlink: a newly linked destination tags failures from its following directory sync or source removal. The EEXIST same-file branch creates no destination and any source mutation is delegated to committed-aware durableRemove. The ENOENT already-restored branch performs no mutation.
7. writeTextExclusive temporary open/write/sync: these touch only a private staging pathname; before publication they are not destination commits and any failure remains untagged.
8. writeTextExclusive destination link and cleanup: destinationLinked is set only after link succeeds; the following destination-directory sync and temporary unlink/directory-sync cleanup failures are tagged. EEXIST identity conflicts and pre-link failures write no destination and remain untagged.
9. replaceText temporary open/write/sync: private staging only before publication, so pre-rename failures are not committed destination writes.
10. replaceText rename: already safe; tempExists is cleared immediately after rename, the following destination-directory sync is tagged, and no cleanup runs after the committed rename.
11. writeSyncedTemp open with O_CREAT, writeFile, and temp sync: private helper for staging bytes only; callers publish solely through the audited link or rename sites, and pre-publication failures do not represent committed domain bytes.

No operation was reordered. lib/memory/retirement-store.ts and retirement pathname sequencing were not touched.

Verification:
- bun x vitest run tests/memory/living-memory-commit-interleavings.test.ts: 11 passed.
- Stage 1 through Stage 3 plus exact parent carrier selection: 15 passed.
- Inverse selection for dry-run, pre-write validation, no-work, and EEXIST conflict: 5 passed.
- bun run test: 263 files, 3078 tests passed.
- bun run lint: 580 files checked, no fixes.
- bun run typecheck: passed.
- git diff --check: passed.
- Final live corpus guard: adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932 and 237 files.
- lib/memory/types.ts remains unchanged at d65ff19c00d28a5b8d03e697b235a19d7e6eca26cfa73bc3c97a0364ff103aea.
- Authored source/test diff is confined to lib/memory/durable-files.ts and tests/memory/living-memory-commit-interleavings.test.ts; the task file contains only Drive/task-protocol state and notes.
