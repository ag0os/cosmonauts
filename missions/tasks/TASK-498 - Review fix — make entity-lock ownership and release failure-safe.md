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

## Implementation Notes

Attempt 1 failed: worker spawn d30ed70e-6d0a-41b4-afa0-cfcdd5dd34b2 timed out after 300000ms while task remained In Progress with all ACs unchecked. Before changing code, inspect the working tree and git log for partial work from that attempt; preserve or clean it deliberately. This is the first failed attempt.
