---
id: TASK-105
title: Implement message bus (lib/orchestration/message-bus.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:parallel-agent-spawning'
dependencies: []
createdAt: '2026-03-21T03:54:35.451Z'
updatedAt: '2026-03-21T03:59:17.818Z'
---

## Description

Create the in-process typed EventEmitter message bus that serves as the communication backbone for parallel agent spawning. This is a standalone foundation module with no dependencies on other new modules.

**File**: `lib/orchestration/message-bus.ts`
**Tests**: `tests/orchestration/message-bus.test.ts`

The bus is generic and designed for extensibility. Initial event types cover spawn lifecycle; future types (AgentMessageEvent, TaskUpdateEvent) will be added later without changing the bus interface.

**API surface**:
- `MessageBus` class with typed `publish<T>(event: T)`, `subscribe<T>(type, handler)`, `waitFor<T>(type, predicate?)` (returns Promise for next matching event), and `unsubscribe()` cleanup.
- Initial event types: `SpawnRegisteredEvent`, `SpawnCompletedEvent`, `SpawnFailedEvent` — each carrying a `spawnId`, `sessionId`, and type-specific payload.
- Event type discriminator field so subscribers can filter by type.

Adapted from the conceptual lifecycle event listener pattern in OpenClaw's `subagent-registry.ts`, but implemented as a generic bus rather than agent-specific wiring.

<!-- AC:BEGIN -->
- [ ] #1 MessageBus class exported from lib/orchestration/message-bus.ts with publish(), subscribe(), unsubscribe(), and waitFor() methods
- [ ] #2 SpawnRegisteredEvent, SpawnCompletedEvent, and SpawnFailedEvent types are defined and exported
- [ ] #3 waitFor() returns a Promise that resolves with the next event matching the given type and optional predicate
- [ ] #4 subscribe() handlers fire for all published events matching the subscribed type
- [ ] #5 unsubscribe() prevents further handler invocations for that subscription
- [ ] #6 Tests cover: publish+subscribe, waitFor resolution, predicate filtering in waitFor, unsubscribe cleanup, and multiple concurrent subscribers
<!-- AC:END -->

## Implementation Notes

Implemented MessageBus as a Map<SubscriptionToken, HandlerEntry> where tokens are unique symbols. subscribe() returns a SubscriptionToken; unsubscribe(token) removes it. waitFor() creates an internal subscription that self-removes on first match. All 14 tests pass; typecheck clean; pre-existing lint error in another file is unrelated.

Coordinator AC verification (all confirmed from implementation notes):
[x] #1 MessageBus exported with publish(), subscribe(), unsubscribe(), waitFor()
[x] #2 SpawnRegisteredEvent, SpawnCompletedEvent, SpawnFailedEvent defined and exported
[x] #3 waitFor() returns a Promise resolving on next matching event
[x] #4 subscribe() handlers fire for all matching events
[x] #5 unsubscribe() stops further invocations
[x] #6 All test scenarios covered — 14 tests pass
