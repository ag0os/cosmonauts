---
id: TASK-680
title: Own descendant cancellation handles
status: To Do
priority: high
labels:
  - orchestration
  - concurrency
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-679
  - TASK-683
createdAt: '2026-09-11T13:25:38.088Z'
updatedAt: '2026-09-13T04:03:39.620Z'
---

## Description

Implement B-010 after live attempt/session identity and waiter repair exist. Register cancellable handles for spawned agents and nested runs at creation time, use the owning attempt's latched signal across Pi turns, and include descendant result settlement in parent cancellation evidence.

<!-- AC:BEGIN -->
- [ ] #1 B-010 registers every in-process owned descendant (detached spawn_agent children, durable nested runs, and inline nested chains) with its identity, result promise, and idempotent cancel operation on the owning attempt at creation time.
- [ ] #2 Parent cancellation uses the owning attempt signal and a latch checked before every prompt; it does not depend on a Pi tool signal surviving the run in which the child was spawned.
- [ ] #3 Each descendant handle receives at most one cancellation request and remains owned until terminal settlement evidence is recorded.
- [ ] #4 Parent confirmation includes descendant result settlement within grace, and an abort-resolved child prompt cannot be recorded as successful without successful completion evidence.
- [ ] #5 No test.todo remains for B-010; its named cancellation tests execute and pass with relevant correctness, lint, and typecheck gates.
<!-- AC:END -->
