---
id: TASK-498
title: Review fix — make entity-lock ownership and release failure-safe
status: To Do
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - pre-existing-on-main
dependencies: []
createdAt: '2026-07-22T22:04:56.416Z'
updatedAt: '2026-07-24T03:33:52.783Z'
---

## Description

**Triage 2026-07-24: PRE-EXISTING ON `main`, not a regression from
`episodic-log-detached-hardening`. Unlabelled from that plan and kept as a
standalone follow-up.**

Evidence: `main`'s `lib/tasks/lock.ts` performs the same unconditional
`unlink(lockPath)` for stale reclamation (line 149) after the same
`isProcessAlive` check (line 66), with no binding to the inspected PID/UUID.
`lib/entity-file-lock.ts` inherited that protocol verbatim when the plan
generalized it — deliberately, since the plan forbade authoring a third lock
protocol. The defect is therefore older than this plan and equally present on
`main` for task-create locking.

Consequence is bounded: the transition lock is fail-soft (D-008), so the worst
case degrades to `main`'s current unserialized behavior rather than below it.

An attempted fix exists in `git stash` ("QM in-flight PR-003 stale-lock
ownership work"). It uses a link-based removal claim whose ownership logic is
sound, but it makes `release()` throw on a benign concurrent-removal path and
left the branch red. Start from it, do not apply it as-is.

Round-3 review (2026-07-24) re-confirmed the release-failure leg specifically:
when the primary update persists but `unlink` fails, `withEntityFileLock`
rejects with the lock still on disk (live PID), `withEpisodeTransitionLock`
returns the persisted result, and the manager then runs episode capture while
that lock is still held — contrary to Design §7's "release, then capture"
ordering — after which later same-entity writers time out and run unlocked,
losing AC-006 serialization until the process exits. This is already this task's
scope ("preserve the primary update but skip transition capture; retry/recover a
failed owned-lock release"). Note the bound: because `updatePlan`/`updateTask`
took NO lock on `main`, the worst case degrades to `main`'s prior unserialized
behavior, not below it (D-008 fail-soft), which is why it is a follow-up rather
than a blocker for this plan's own scope.

Original framing follows.

Round-1 remediation for F-003/PR-003/SR-002 and F-004/SR-003/UR-002. Harden the existing shared entity-file lock without creating a third protocol. Prevent stale reclaimers or releasers from deleting replacement-owner locks; preserve same-entity serialization during stale recovery. Make transient owned-lock release failure retry/recover in a bounded way. If release cannot be confirmed, preserve the successful primary update but skip transition episode capture and report truthful bounded warning text. Keep acquisition error/timeout fail-soft and action single-execution.

<!-- AC:BEGIN -->
- [ ] #1 Two deterministic stale-recovery contenders cannot both enter and neither removes a replacement owner.
- [ ] #2 Release never removes a replacement PID/nonce owner and a transient first unlink failure is retried/recovered without changing the primary result.
- [ ] #3 Plan/task transition capture occurs only after lock release is confirmed; unreleased ownership warns and skips capture.
- [ ] #4 Acquisition error/timeout still runs the action unlocked exactly once within the bound, and action failure is not retried.
- [ ] #5 Filesystem lock protocol implementation count remains exactly two and focused/full verification stays green.
<!-- AC:END -->

## Design Decision (D-498-1 — drafted 2026-07-24, pre-implementation)

Ground truth from the current `main` (`8401213`), verified before drafting:

- `lib/entity-file-lock.ts` `release()` is **already retryable** — it sets
  `released = true` only after a successful `unlink` or a confirmed not-ours
  check, so a failed `unlink` leaves the handle retryable. This matches the
  `lib/driver/lock.ts` release fix (B-029). The primitive is not the gap.
- The gap is the **caller**: `withEntityFileLock`'s `finally` calls
  `handle.release()` exactly once and then discards the handle, so a transient
  `unlink` failure strands a live-owner lock with no retry.
- `breakStaleLock(path)` unlinks **by path only**, not bound to the PID/nonce it
  inspected — the SR-002 double-acquire race.
- The `git stash@{0}` attempt is partially good and partially wrong (below).

**Decision — separate two concerns; do NOT unify them.**

1. **Stale reclamation (acquire-time; another process's dead lock) becomes
   owner-bound.** Replace `breakStaleLock(path)` with a removal that links the
   lock into a private removal name, re-reads through that link, and unlinks the
   original **only if** the linked content still equals the exact owner that was
   inspected. If a live owner replaced the stale lock in the window, the content
   no longer matches and nothing is unlinked, so the SR-002 "A removes stale, A
   acquires, B removes A's live lock" race cannot happen. Adopt the stash's
   `removeLockIfOwner` for this — **but** with one required change: the removal
   temp name must be **unique per attempt** (`pid + randomUUID`, like
   `tryCreateLock`'s temp), NOT the stash's fixed `.removing.lock`. A fixed name
   lets a crashed remover strand the temp and livelock every future reclaimer on
   `EEXIST`. Actual acquisition exclusivity still comes from `tryCreateLock`
   (`O_EXCL`), so removal does not need its own mutual exclusion — unique temps
   are strictly safer than the EEXIST-gated fixed name.

2. **Release (our own lock) stays simple and non-throwing.** Keep the existing
   `release()` body (read → `sameLock` → `unlink`; retryable). **Reject the
   stash's `createHandle` change** — routing release through the link dance and
   `throw new Error("release already in progress")` is the defect that reddened
   the branch: a throw out of `release()` propagates through the `finally` and
   can fail a primary update, violating D-008. Release must never throw in a way
   that fails the update.

3. **Release-failure recovery lives at the caller, fail-soft.** In
   `withEntityFileLock`'s `finally`, retry release a bounded number of times
   (adopt the stash's `releaseWithRetry`). If release still cannot be confirmed:
   the primary action has already persisted, so **return it** — never reject the
   update on a lock-release failure. Surface "release unconfirmed" to
   `withEpisodeTransitionLock` so the manager **skips** transition capture and
   warns truthfully, rather than capturing under a still-held lock (Design §7
   "release, then capture"). Losing one transition episode on a rare `unlink`
   failure is inside the D-008 fail-soft envelope; capturing under a held lock is
   not.

4. **Accepted residual (bound).** A *persistent* `unlink` failure (e.g. `EIO` on
   the project's own `.cosmonauts/`) still strands a live-owner lock, and because
   the PID is alive, pid-liveness stale-recovery will not reclaim it — later
   same-entity writers time out and run unlocked. This is accepted, not fixed:
   `updatePlan`/`updateTask` took **no** lock on `main`, so the degraded state is
   exactly `main`'s prior unserialized behavior, never worse (D-008). Age- or
   heartbeat-based reclamation of a live-PID lock is explicitly out of scope —
   it is a larger, riskier change to a shared primitive for a
   catastrophic-filesystem-only edge.

5. **Exactly two lock protocols.** `lib/entity-file-lock.ts` (generalized) and
   `lib/driver/lock.ts` (driver plan lock, different lifecycle) stay separate;
   their `release()` bodies are already at parity. Do not merge them and do not
   add a third. `lib/tasks/lock.ts` remains the thin caller.

6. **OFF-state evidence.** Entity locks are acquired only when
   `hasEpisodeContext` and the gate resolves enabled. None of the above changes
   OFF behavior: no lock, no removal temp, no release path is entered. Prove it —
   keep the existing OFF assertions and add one covering that a leftover removal
   temp never appears in a scanned/`git`-visible location (removal temps live
   flat in `.cosmonauts/`, matching the single-level `.cosmonauts/*.lock` ignore
   glob and the same `missions/`-exclusion reasoning as the lock files).

**Net for the implementer:** cherry-pick `removeLockIfOwner` (with unique temp
names) for stale reclamation and `releaseWithRetry` for the caller `finally`;
drop the stash's `createHandle` throwing-release entirely; add the
release-unconfirmed → skip-capture signal through `withEpisodeTransitionLock`.
Every new test verified RED against the unfixed code (Edit-to-mutate then
Edit-back — never `git checkout -- <file>` on uncommitted work).

**Open question for the human before coding:** AC #3 says skip capture when
release is unconfirmed. Confirm that dropping a single transition episode (vs.
capturing it under a still-held lock) is the intended trade — it is the
conservative D-008 reading, but it does mean a real status transition can go
unrecorded on a rare `unlink` failure.

## Implementation Notes

Attempt 1 failed: worker spawn d30ed70e-6d0a-41b4-afa0-cfcdd5dd34b2 timed out after 300000ms while task remained In Progress with all ACs unchecked. Before changing code, inspect the working tree and git log for partial work from that attempt; preserve or clean it deliberately. This is the first failed attempt.
