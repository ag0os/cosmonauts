---
id: TASK-253
title: 'Plan 1: Plan-level lock and repo-level commit lock'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:33:02.121Z'
updatedAt: '2026-05-04T19:04:32.509Z'
---

## Description

Implement `lib/driver/lock.ts` and `tests/driver/lock.test.ts`.

See **Implementation Order step 5**, **D-P1-3**, **D-P1-4**, QC-008, QC-009, QC-010 in `missions/plans/driver-primitives/plan.md`.

Two distinct locks required:
1. **`acquirePlanLock`** — per-plan exclusive, atomic O_EXCL on `missions/sessions/<planSlug>/driver.lock`. Prevents concurrent same-plan runs. Acquired by `runInline`; Plan 3's binary acquires its own copy.
2. **`acquireRepoCommitLock`** — held briefly (during `git add`/`git commit` only) at `<repoRoot>/.cosmonauts/driver-commit.lock`. Serializes commits across concurrent runs on *different* plans in the same repo.

Both locks use `kill -0` (ESRCH) for stale-lock detection.

<!-- AC:BEGIN -->
- [x] #1 acquirePlanLock(planSlug, runId, cosmonautsRoot): Promise<LockHandle | {error:'active'; activeRunId; activeAt}> uses atomic O_CREAT|O_EXCL on missions/sessions/<planSlug>/driver.lock; lock content is {runId, pid, startedAt}.
- [x] #2 acquireRepoCommitLock(repoRoot): Promise<LockHandle> uses atomic O_CREAT|O_EXCL on <repoRoot>/.cosmonauts/driver-commit.lock; same stale-detection logic.
- [x] #3 Stale lock (PID dead via kill -0 → ESRCH): break lock file, retry once; result is a valid LockHandle.
- [x] #4 LockHandle.release() removes the lock file.
- [x] #5 Concurrent acquirePlanLock for the same planSlug with a live PID: second call returns {error:'active'} without creating a second lock.
- [x] #6 tests/driver/lock.test.ts covers plan-lock atomic acquisition, repo-commit-lock atomic acquisition, stale-lock break for both, and concurrent plan-lock rejection; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Implemented lib/driver/lock.ts and tests/driver/lock.test.ts. Verified files with ls. `bun run test --grep "lock"` passes. `bun run typecheck` was run but is blocked by unrelated untracked prompt-template test/type mismatches outside TASK-253: tests/driver/prompt-template.test.ts references PromptLayers.workdir.
