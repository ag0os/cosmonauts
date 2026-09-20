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

Deliver B-011 (`execution-liveness` plan), independently of deadline policy. Today, when a parent's five-minute wait for spawn completions expires, the children still running are reported to it as failed. Wait expiry is an observation limit, not a child deadline: make giving up a wait end only that wait.

The observer is an agent that called `spawn_agent`; the entry point is that tool and the completion messages it promises. Test design is yours — drive the behavior through that entry point, not through helpers only a test would call.

<!-- AC:BEGIN -->
- [ ] #1 B-011 A parent whose wait expires or is cancelled is not told that a still-healthy child failed or timed out, and that child keeps running.
- [ ] #2 B-011 When that child later finishes, the parent receives its real result exactly once — on its next wait, or buffered for a later one. With several children, one abandoned wait neither swallows nor duplicates another child's completion.
- [ ] #3 B-011 A completion that arrives when nobody is waiting does not throw, is attributed to the right spawn, and never records a successful child as failed.
- [ ] #4 A child is cancelled only when the attempt that owns it is cancelled. Existing maximum spawn concurrency and depth rejection are unchanged; semaphore queueing stays out of scope.
- [ ] #5 The code behavior is protected by tests designed after seeing the code, driven through the shipped entry point, and each seen to fail against deliberately broken logic; correctness, lint, and typecheck gates pass.
<!-- AC:END -->
