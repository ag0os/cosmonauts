---
id: TASK-106
title: Implement semaphore (lib/orchestration/semaphore.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies: []
createdAt: '2026-03-21T03:54:42.184Z'
updatedAt: '2026-03-21T03:57:27.311Z'
---

## Description

Create a simple counting semaphore for concurrency control. Standalone primitive used by the spawn tracker to cap concurrent child sessions and avoid API rate limiting.

**File**: `lib/orchestration/semaphore.ts`
**Tests**: `tests/orchestration/semaphore.test.ts`

**API surface**:
- `Semaphore` class with configurable max concurrency (constructor arg).
- `acquire()` — returns a Promise that resolves when a slot is available. Callers queue if all slots are taken.
- `release()` — frees a slot, unblocking the next queued `acquire()` waiter.
- `available` getter — current number of free slots.

No dependencies on other new modules.

Acceptance Criteria:
- [x] #1 Semaphore class exported from lib/orchestration/semaphore.ts with acquire() and release() methods
- [x] #2 acquire() resolves immediately when slots are available
- [x] #3 acquire() queues callers when all slots are occupied, resolving in FIFO order as release() is called
- [x] #4 Semaphore correctly enforces the max concurrency limit under concurrent acquisition
- [x] #5 Tests cover: immediate acquire when slots free, queuing when full, FIFO release order, available getter reflects current state

<!-- AC:BEGIN -->
- [ ] #1 Semaphore class exported from lib/orchestration/semaphore.ts with acquire() and release() methods
- [ ] #2 acquire() resolves immediately when slots are available
- [ ] #3 acquire() queues callers when all slots are occupied, resolving in FIFO order as release() is called
- [ ] #4 Semaphore correctly enforces the max concurrency limit under concurrent acquisition
- [ ] #5 Tests cover: immediate acquire when slots free, queuing when full, FIFO release order, available getter reflects current state
<!-- AC:END -->

## Implementation Notes

Implemented as a simple counting semaphore with an internal FIFO queue of resolve callbacks. When all slots are taken, acquire() returns a Promise whose resolve is pushed onto the queue; release() shifts the next waiter and calls it directly (slot stays consumed), or increments _available if the queue is empty. All 6 tests pass. The pre-existing lint error in another file is unrelated to this task.
