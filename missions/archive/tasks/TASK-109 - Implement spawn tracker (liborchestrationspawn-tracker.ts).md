---
id: TASK-109
title: Implement spawn tracker (lib/orchestration/spawn-tracker.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies:
  - TASK-105
  - TASK-106
  - TASK-107
createdAt: '2026-03-21T03:55:10.335Z'
updatedAt: '2026-03-21T04:05:38.036Z'
---

## Description

Create the per-session spawn registry that tracks active children, enforces breadth/depth limits, and bridges between the spawner (which controls session lifecycle) and the spawn tool (which registers children from tool calls).

**File**: `lib/orchestration/spawn-tracker.ts`
**Tests**: `tests/orchestration/spawn-tracker.test.ts`

**Dependencies**: message-bus (TASK-105), semaphore (TASK-106), spawn-limits (TASK-107)

**API surface**:
- `SpawnTracker` class — per-session instance.
  - `register(spawnId, role, depth)` — records a new child spawn; acquires semaphore slot; throws if depth or breadth limit exceeded.
  - `complete(spawnId, summary)` — marks a spawn complete, releases semaphore, publishes `SpawnCompletedEvent` on the bus.
  - `fail(spawnId, error)` — marks a spawn failed, releases semaphore, publishes `SpawnFailedEvent`.
  - `activeCount()` — number of currently running children.
  - `canSpawn(depth)` — returns true if breadth and depth limits allow another spawn.
  - `nextCompletion()` — Promise that resolves with the next `SpawnCompletedEvent | SpawnFailedEvent` from the bus.
  - `drainCompleted()` — returns all buffered completion results (already-arrived events not yet consumed).
  - `dispose()` — cleans up bus subscriptions.
- Module-level `Map<sessionId, SpawnTracker>` registry with `getOrCreateTracker(sessionId)` and `removeTracker(sessionId)` for spawner↔extension bridging.

Adapted from OpenClaw's `subagent-registry.ts` — simplified: no persistence, no announce, no orphan recovery.

<!-- AC:BEGIN -->
- [x] #1 SpawnTracker class exported with register(), complete(), fail(), activeCount(), canSpawn(), nextCompletion(), drainCompleted(), and dispose() methods
- [x] #2 register() acquires a semaphore slot and throws if max concurrent spawns or max depth is exceeded
- [x] #3 complete() and fail() release the semaphore slot and publish the appropriate event on the message bus
- [x] #4 nextCompletion() resolves with the next completion or failure event in arrival order
- [x] #5 drainCompleted() returns all buffered events that have arrived since the last drain, without waiting
- [x] #6 Module-level getOrCreateTracker() and removeTracker() functions manage the sessionId→SpawnTracker map
- [x] #7 Tests cover: registration and limit enforcement (breadth, depth), completion/failure lifecycle, nextCompletion() resolution, drainCompleted() buffering, and dispose() cleanup
<!-- AC:END -->

## Implementation Notes

Verified by re-run worker: all 39 tests pass (vitest). Both lib/orchestration/spawn-tracker.ts and tests/orchestration/spawn-tracker.test.ts were fully implemented by the previous worker. No code changes needed — only AC checkoff was missing. All 7 ACs confirmed satisfied.
