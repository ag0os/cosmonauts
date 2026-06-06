---
id: TASK-302
title: Atomic task ID allocation
status: Done
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - tasks
dependencies: []
createdAt: '2026-05-12T19:34:14.593Z'
updatedAt: '2026-05-12T19:52:40.885Z'
---

## Description

TaskManager.createTask allocates IDs without a lock; interleaved creates collide on the same ID. Serialize the create critical section (load tasks -> allocate ID -> write file -> bump lastIdNumber) behind a process+filesystem lock, reusing the lock-file pattern from lib/driver/lock.ts (extract a generic helper or add acquireTaskCreateLock). Re-read tasks after acquiring the lock. Break stale lock files via isProcessAlive.

<!-- AC:BEGIN -->
- [x] #1 createTask serializes via a lock file (e.g. missions/tasks/.create.lock); the lock is released on success and on error
- [x] #2 After acquiring the lock, the existing-task set is re-read so allocation accounts for a concurrent writer
- [x] #3 Stale lock files (dead owner pid) are broken and acquisition retries
- [x] #4 Regression test: N concurrent createTask calls on one TaskManager yield N distinct IDs and N task files
- [x] #5 Regression test: N concurrent createTask calls across N TaskManager instances over the same dir yield N distinct IDs
- [x] #6 bun run test, lint, typecheck all pass
<!-- AC:END -->

## Implementation Notes

Serialized createTask's critical section behind a process+filesystem lock. Added lib/tasks/lock.ts (withTaskCreateLock/getTaskCreateLockPath) modeled on lib/driver/lock.ts: link-based lock at .cosmonauts/task-create.lock, stale-lock detection via process.kill(pid,0)+break+retry, release on success and error. In task-manager.ts, createTask now wraps createTaskLocked in withTaskCreateLock; loadAllTasks() moved inside the lock so allocation re-reads tasks a concurrent writer just created. Added .cosmonauts/*.lock to .gitignore. New tests in tests/tasks/task-manager-concurrency.test.ts: 8 concurrent createTask calls on one TaskManager, and across 8 separate TaskManager instances over the same dir -> distinct IDs + correct file count. Verified: typecheck clean for these files (pre-existing unrelated errors in lib/driver backends from a concurrent Issue-3 change); bunx biome check clean on changed files; vitest passes for tasks suites and full suite except the 2 unrelated driver backend test files (claude-cli/codex) being modified by another agent.
