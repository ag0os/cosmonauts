# Independent Structural Review: republication error paths

- Date: `2026-09-09`
- Task: `TASK-667`
- Remediation commit: `862dce3` (`587f8ea..862dce3`), plus the test-gap closure
  this record required (see "Coordinator action on the low finding").
- Reviewer: independent `codex exec --sandbox read-only`, given all three axes of
  the class, the idempotent-primitive semantics, and eight numbered questions
  including an explicit instruction to look for the *opposite* defect.
- Verdict: **SHIP — no unresolved high or medium findings**

## Positive coverage

Recorded in full because a bare "no findings" is not evidence that anything was
checked (this plan's own improvements record, observation 5).

**1. Guard completeness — all four complete for the stated republication paths.**
The proposal guard encloses the confirmation read and the changed-bytes failure,
with no later throwing operation before the successful result. Receipt `read()`
covers the confirmation read, the byte comparison and `parseReceipt`. Receipt
`markMaterialized()` wraps directory validation and pre-write `replaceText`,
while a `replaceText` failure *after* its rename already carries the primitive's
own bit and is retained. Source `finalize()` sets its accumulator immediately
after every operation that can commit. **No post-republication throw drops the
bit.**

**2. No false-positive committed tags** — the opposite defect was searched for
explicitly and three concrete negative paths were confirmed still untagged: an
unchanged existing file whose confirmation sees `destinationLinked: false` and is
then changed; a `markMaterialized` that read without republishing and then fails
directory validation; and a `finalize()` that recovers a stale journal, performs
only ENOENT no-ops, and then rejects invalid represented input.

**3. Error identity.** `hasCommittedWrites` prevents double-wrapping at the
materialization guard; `read()` errors arise before that guard and are not
wrapped twice. The wrapper classes are module-private and **no production caller
matches on them** — consumers read the structural `writesCommitted` property. One
pre-existing nesting remains possible in `finalize()` (`removeEpisodeFile` wraps,
then the outer catch wraps again); it predates this commit's condition change,
preserves the original message, and retains the chain through `cause`.

**4. Removing the `pruned.length` clause opened no under-report.** Every write
this pass makes sets or carries the bit — proposal confirmation `:512-516`,
journal replacement `:541-545`, tombstone removal `:557-562`, recovery
`:641-658`. The only `pruned.length > 0 && !writesCommitted` case is recovery
observing an already-absent episode with an ENOENT journal cleanup, where this
pass committed nothing. Removing the proxy is correct.

**5. Independent enumeration across all three axes**, built by the reviewer rather
than taken from the commit: proposal creation and confirmation, receipt creation,
stale discharge, receipt confirmation, receipt materialization, episode recovery,
episode finalization, and pass aggregation — each with its success fact and its
error fact. **No changed path infers commitment from proposal status, receipt
state, prune count, or successful return.** `retirement-store.ts` is the expressly
excluded subsystem and is byte-identical.

**6. Test strength**, checked one at a time: all four `862dce3` tests fail if
their guard is removed, and each reaches the interleaving it claims — with one
qualification, below.

**7. All four production comments accurate**, and the test comments match their
modelled interleavings.

**8. No durable filesystem operation added, removed, or reordered.**
`lib/memory/retirement-store.ts` byte-identical between `587f8ea` and `862dce3`
by identical git blob and content hash.

## Coordinator action on the low finding

The review recorded one **low-severity test gap**, below the closing threshold
but specific and cheap: the receipt test reached the *already-covered*
changed-bytes branch, because `readSafeRegularText` returns `undefined` rather
than throwing. The narrow pre-`862dce3` wrapper would have passed it too, so the
test did not prove the `parseReceipt` expansion its guard claims.

Closed rather than carried. A new regression seeds malformed receipt bytes
directly, so the confirmation read *matches* and `parseReceipt` is what throws
after `destinationLinked: true`. Verified to distinguish the two guards: with the
narrow branch-only wrapper restored, the new test is **red** and the other thirty
still pass; with the broad guard, all thirty-one pass. That is the exact
discrimination the review said was missing.

Fixing a low finding is not required to close, and this record does not treat it
as though it were. It is recorded because the fix changed the artifact the review
assessed.

## Structural Gate Status

All five bindable gates remain **degraded/unbound** in both sessions. No
executable structural evidence exists for any of them. The mutation evidence
across rounds 16-18 (nineteen mutations, each applied alone) is targeted
negative-control evidence, not a structural-analysis result, and does not convert
an unbound gate into a passing one.

## Verification

- `bun run test`: **3112 passed**, 263 files, exit 0. The first run of this set
  hit the known `tests/plans/archive.test.ts` flake — the same
  `?? .cosmonauts/episode-task-TEST-001.lock.<pid>.<uuid>.tmp` git-status
  signature `review-15` recorded. The file passes in isolation (20/20) and the
  full re-run is clean.
- `bun run typecheck`, `bun run lint`, `git diff --check`: clean.
- `plan check-artifacts living-memory-fidelity`: GREEN, 12 behaviours, 0 issues,
  0 advisories.
- Live corpus guard before and after:
  `adc3ef70a5e75cad8813db9a3ab954d4da84ebfeafbb75703529048007469932`, 237 files.
- `lib/memory/retirement-store.ts` unchanged at
  `f064d1db0f26e70ae70d399a85184509b8147ad5b018cd0708def179228b400c`.

## Closing assessment

Three consecutive independent rounds found real defects; this one did not, and
said positively what it checked instead. The class is closed on all three axes
with executable negative controls at every seam, and the reviewer's own
enumeration — built without reference to the commit's account — found no
remaining place where a commit fact is produced, inferred, or lost.

**Zero unresolved high or medium findings. The Quality Contract assertion 8
threshold is met and this plan can close.**

Structural enforcement of the class remains conventional rather than mechanical.
That is the honest residue, and it is carried by the spec-ready plan
`missions/plans/living-memory-structural-hardening/` rather than left implicit.
