---
id: TASK-683
title: Make spawn completion waiters lossless
status: To Do
priority: high
labels:
  - orchestration
  - concurrency
  - testing
  - 'plan:execution-liveness'
dependencies: []
createdAt: '2026-09-13T04:02:33.641Z'
updatedAt: '2026-09-13T04:02:33.641Z'
---

## Description

Implement B-011 independently of deadline policy. Replace bare resolver entries with removable waiter records and make timeout, cancellation, multi-child completion, and late completion idempotent without turning the five-minute observation wait into a child deadline.

<!-- AC:BEGIN -->
- [ ] #1 B-011 timeout and cancellation remove the exact abandoned waiter while wait expiry never cancels an otherwise healthy child.
- [ ] #2 Multi-child completion after one abandoned wait is delivered exactly once to an active waiter or buffered for a later caller without duplication or swallowing.
- [ ] #3 A late complete call is idempotent, does not throw, and cannot misrecord spawn lineage or a successful child as failed.
- [ ] #4 Existing maximum spawn concurrency/depth rejection remains unchanged and semaphore queueing stays out of scope.
- [ ] #5 No test.todo remains for B-011; its named race tests execute and pass with relevant correctness, lint, and typecheck gates.
<!-- AC:END -->
