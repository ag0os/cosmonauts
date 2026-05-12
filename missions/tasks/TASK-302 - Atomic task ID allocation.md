---
id: TASK-302
title: Atomic task ID allocation
status: To Do
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - tasks
dependencies: []
createdAt: '2026-05-12T19:34:14.593Z'
updatedAt: '2026-05-12T19:34:14.593Z'
---

## Description

TaskManager.createTask allocates IDs without a lock; interleaved creates collide on the same ID. Serialize the create critical section (load tasks -> allocate ID -> write file -> bump lastIdNumber) behind a process+filesystem lock, reusing the lock-file pattern from lib/driver/lock.ts (extract a generic helper or add acquireTaskCreateLock). Re-read tasks after acquiring the lock. Break stale lock files via isProcessAlive.

<!-- AC:BEGIN -->
- [ ] #1 createTask serializes via a lock file (e.g. missions/tasks/.create.lock); the lock is released on success and on error
- [ ] #2 After acquiring the lock, the existing-task set is re-read so allocation accounts for a concurrent writer
- [ ] #3 Stale lock files (dead owner pid) are broken and acquisition retries
- [ ] #4 Regression test: N concurrent createTask calls on one TaskManager yield N distinct IDs and N task files
- [ ] #5 Regression test: N concurrent createTask calls across N TaskManager instances over the same dir yield N distinct IDs
- [ ] #6 bun run test, lint, typecheck all pass
<!-- AC:END -->
