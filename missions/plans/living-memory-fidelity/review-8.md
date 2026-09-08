# Stage 3 Round 3 Fresh Structural Review: living-memory-fidelity

- Date: `2026-09-07`
- Task: `TASK-649`
- Reviewed range: `c023ffb..99c47d8` (the complete permitted Stage-3 implementation diff: the original committed-write work, the SR-004/SR-005/SR-006 caller-level remediation, and the SR-007 primitive-level remediation)
- Reviewer context: six of seven parent review fixes introduced a fresh defect. Within this plan, Stage 1 remediation introduced SR-001, Stage 2 remediation introduced SR-002 and discharged a live receipt, Stage 3 round 1 left the committed-write class open at multiple caller sites, and round 2 closed those caller sites while leaving the class open in the durable primitives. This round therefore traced the class through assembly, caller, primitive, and result consumption rather than reviewing only TASK-648's incremental patch.
- Verdict: **pass — zero unresolved high or medium findings; Stage 3 closes and Stage 4 may begin**

## Findings

No unresolved high or medium finding was identified.

## SR-007 Closure

SR-007 is closed in both required `writeTextExclusive()` failure windows:

- After `link(tempPath, options.path)` succeeds, `destinationLinked` becomes true before the destination-directory sync. A non-`EEXIST` failure from that sync is therefore rethrown as `DurableFileCommittedError`, whose structural `writesCommitted: true` tag is consumed by the consolidator's outer committed-state fold.
- The `finally` cleanup retains the original unlink-then-directory-sync sequence. If either cleanup operation fails after the destination link, `rethrowExclusiveCleanupError()` emits the same committed tag. A successful return can still become a cleanup failure, as it must when cleanup cannot be confirmed, but that failure no longer silently hides the destination write.

The inverse branch remains precise. If the destination link loses an `EEXIST`
race, `destinationLinked` remains false. Different winner bytes produce the
identity-conflict error without a committed tag, and temporary cleanup cannot
turn it into a committed error. The competing winner remains untouched.

## Independent Durable-Mutation Enumeration

The task's eleven-item enumeration was checked against every mutating filesystem
operation in `lib/memory/durable-files.ts`. Its caller/helper entries overlap for
temporary writes, but together they are complete. The independent operation
inventory is:

| Site | Mutation | Tagging or safety rationale | Result |
|---|---|---|---|
| `ensureDirectory()` | recursive `mkdir` | Creates directory metadata, not living-memory content bytes or a lifecycle record. Later validation/sync failures do not follow a committed domain-byte mutation. | safe, untagged |
| `assertRemovalSupported()` | private probe `link` and `unlink` | Mutates only a generated capability-probe pathname. Failures become `DurableRemovalUnsupportedError`; best-effort cleanup is intentionally outside living-memory commit reporting. | safe, untagged |
| `durableLink()` | destination `link` | `linked` becomes true only after a successful link. A later destination-directory sync failure is tagged. `EEXIST` same-inode recovery creates nothing and remains untagged. | closed |
| `durableRemove()` | pathname `unlink` | Existing `removed` flag is set only after the unlink. A later directory-sync failure is tagged; `ENOENT` creates no mutation. | closed |
| `durableRename()` | same-directory `rename` | The only following operation is the existing directory sync, now wrapped with the committed tag. | closed |
| `durableRestore()` | destination `link`, then delegated source `unlink` | A newly linked destination tags failures from its following sync or source removal. The `EEXIST` same-file branch creates no destination; any source unlink is delegated to committed-aware `durableRemove()`. The `ENOENT` already-restored branch mutates nothing. | closed |
| `writeSyncedTemp()` | exclusive temporary `open`, `writeFile`, and file sync | Both callers use a generated private staging pathname. Before publication, a failure does not commit destination/domain bytes. | safe, untagged |
| `writeTextExclusive()` | destination `link` | `destinationLinked` records only a successful publication. Every later sync or cleanup throw is tagged; pre-link and identity-conflict failures remain untagged. | SR-007 closed |
| `writeTextExclusive()` | temporary `unlink` and directory sync | After publication, either cleanup failure is tagged. Without publication, cleanup affects only staging state and remains untagged. | closed |
| `replaceText()` | destination `rename` | `tempExists` is cleared immediately after the rename. The following directory sync is tagged, and the committed branch never enters temporary cleanup. | closed |
| `replaceText()` | pre-publication temporary `unlink` and directory sync | Cleanup is reachable only while `tempExists` remains true, which means the destination rename did not complete. It affects only private staging state. | safe, untagged |

No further byte or namespace mutation exists in the file. File and directory
handle closes do not mutate content or pathnames; the remaining file operations
are reads, metadata checks, or syncs of already enumerated mutations.

## Operation-Order Audit

No operation was reordered anywhere in `lib/memory/durable-files.ts`. The
ordered sequence of every `mkdir`, `link`, `unlink`, `rename`, temporary write,
sync, and delegated remove call is byte-for-byte identical after whitespace
normalization between `c023ffb` and `99c47d8`; the comparison exited 0. Manual
diff inspection confirms TASK-648 added flags, `try`/`catch` wrappers, and the
cleanup rethrow helper only. It did not move an operation, change what is synced,
or change link/rename/unlink sequencing.

`lib/memory/retirement-store.ts` is unchanged in the complete Stage-3 range.
Retirement pathname sequencing is untouched, D-026 is neither reopened nor
given another verification layer, and the fix stays within D-012's error-tagging
authorization.

## Inverse Audit: No False-Positive Commit Bit

No path reviewed sets `writesCommitted` true without a corresponding durable
domain mutation:

- Dry runs never accept/materialize receipts, finalize sources, or perform live retirement; proposal previews have `status: "preview"`, so the write-through adapter does not report them.
- Failures before any destination link or rename remain untagged, and the outer fold preserves false unless an earlier phase already committed.
- The healthy no-work branch performs no mutating seam and returns `noop` with `writesCommitted: false`.
- An exclusive-write `EEXIST` identity conflict leaves `destinationLinked` false, preserves the winner bytes, and throws without `writesCommitted`.
- `durableLink()`'s same-inode `EEXIST`, `durableRemove()`'s `ENOENT`, and `durableRestore()`'s already-restored branch create no new mutation and do not synthesize a committed tag.

The focused suite exercises the named dry-run, pre-write validation, no-work,
and EEXIST controls. No inverse-direction high or medium finding was identified.

## Caller and Result-Assembly Closure

The complete Stage-3 range retains one OR-only write-through accumulator in
`createLivingMemoryConsolidator()`. Retirement results, source recovery,
successful written proposals, accepted-receipt creation, episode finalization,
receipt materialization, and structurally tagged errors report into it before
later work can fail. Final result assembly reuses the accumulator instead of
reconstructing the bit from phase-local arrays or the final control-flow shape.

The inherited receipt-written-then-fail-closed-validation regression is real and
non-vacuous. With the accepted-receipt commit report temporarily moved below the
second `validateJudgmentOutput()` call, the focused test failed with:

```text
-     "writesCommitted": true,
+     "writesCommitted": false,
```

The source was restored exactly, and the test then passed in the focused and
full suites. This pins the required report-before-validator ordering without
weakening fail-closed validation.

## Parent Ownership, Boundary, and Ratified Ground

- All six parent carrier marker/name pairs remain exact: the B-012 owner in `tests/memory/interface.test.ts`; the B-016 owner plus record-limit and byte-limit carriers in `tests/memory/living-memory.test.ts`; and the B-021 exact-renderer owner plus oversized-metadata carrier in the extension and living-memory suites.
- `lib/memory/types.ts` and its frozen public-contract pin are unchanged in Stage 3. The receipt floor, retirement/byte authority, fail-closed model-output validation, existing behavior markers, Stage-1 measurement contract, Stage-2 completeness barrier, and append-only warning propagation remain unweakened.
- The Stage-3 implementation diff is confined to `lib/memory/consolidation-receipts.ts`, `lib/memory/durable-files.ts`, `lib/memory/living-memory.ts`, and mirrored tests under `tests/memory/`. TASK-649 authors only this next-unused review record; Drive-owned task-state edits are separate run state.
- `review-8.md` was absent before this task and is the next unused integer greater than every existing `review-*.md`. No prior review record was overwritten, renamed, or deleted.
- Live `knowledge/` was not modified, moved, deleted, or targeted by a write-capable command.

## Structural Gate Status

No executable structural-analysis capability was registered in this reviewer
session. Therefore no executable structural evidence exists for any bindable
gate below. The complete permitted diff was inspected by hand. Absence of tool
findings is **not** a passing structural result.

| Gate | Status | Manual review evidence |
|---|---|---|
| `mutation` | **degraded/unbound** | Independently enumerated every mutating primitive and checked both positive tagging and inverse no-write controls; no executable mutation evidence exists. |
| `duplication` | **degraded/unbound** | Traced the single write-through accumulator and all primitive/caller consumers by hand; no executable duplication evidence exists. |
| `complexity` | **degraded/unbound** | Traced success, failure, cleanup, dry-run, no-work, recovery, and identity-race paths manually. |
| `boundary-conformance` | **degraded/unbound** | Inspected the complete Stage-3 range, allowed implementation paths, parent carriers, D-012 limit, D-026 exclusion, and review numbering manually. |
| `dead-code` | **degraded/unbound** | Checked the new flags, error wrapper, cleanup helper, and consumers within changed scope only; no repo-wide sweep or executable dead-code evidence exists. |

## Verification

- `bun x vitest run tests/extensions/architecture-memory.test.ts tests/memory/consolidation-sources.test.ts tests/memory/living-memory.test.ts tests/memory/interface.test.ts tests/memory/living-memory-commit-interleavings.test.ts` — passed, 5 files and 130 tests.
- Negative mutation check for `retains the receipt commit when fail-closed validation rejects the written output` — failed as expected after moving the report below validation, receiving `writesCommitted: false`; passed after exact restoration.
- `bun run test` — passed on the final serial run, 263 files and 3,078 tests.
- `bun run lint` — passed, 580 files checked with no fixes.
- `bun run typecheck` — passed.
- `git diff --check` — passed.
- Live corpus guard before review: SHA-256 `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237 files.

One earlier full-suite attempt observed a transient failure in
`tests/plans/archive.test.ts` while an asynchronous episode-task lock remained in
that test's temporary directory:

```text
FAIL  tests/plans/archive.test.ts > archivePlan > keeps enabled task transition locks outside the archive task scan and git status
expected '?? .cosmonauts/episode-task-TEST-001.…' to be ''
ENOTEMPTY: directory not empty, rmdir '.../.cosmonauts'
```

That unrelated test passed immediately in isolation, and the complete serial
`bun run test` rerun passed all 3,078 tests. The failure is not reproducible at
the task boundary and does not touch the reviewed memory paths.

## Assessment

SR-004, SR-005, SR-006, and SR-007 are closed. The independent primitive
enumeration found no fourth under-reporting level, the inverse audit found no
false-positive committed bit on the bounded paths, and zero unresolved high or
medium findings remain. Stage 3 closes; Stage 4 may begin.
