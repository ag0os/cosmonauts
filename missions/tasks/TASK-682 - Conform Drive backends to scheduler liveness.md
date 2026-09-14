---
id: TASK-682
title: Conform Drive backends to scheduler liveness
status: To Do
priority: high
labels:
  - backend
  - drive
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-678
createdAt: '2026-09-13T04:02:33.637Z'
updatedAt: '2026-09-13T04:12:22.979Z'
---

## Description

Implement B-007 and B-019 after the shared watchdog exists. Inventory every production backend capability, move Drive's task cap into explicit scheduler hard-timeout policy, remove the abandoning backend-local timer, and ensure Drive backend and TaskManager effects use the fenced store foundation before scheduler finalization.

<!-- AC:BEGIN -->
- [ ] #1 B-007 declares and pins cancellation, activity, timeout, mutation/isolation, and settlement capabilities for every production backend population.
- [ ] #2 B-019 maps Drive's existing cap to hardTimeoutMs with its source persisted and removes the backend-local abandoning timer plus ambiguous RunPolicy.timeoutMs writers; chain_run.timeoutMs stays an inline-only cap recorded as metadata on the durable path, and the inert 30-minute durable-chain claim in docs/orchestration.md is corrected.
- [ ] #3 The chain backend consumes BackendContext.signal rather than a captured chain-level signal, and exact-shape capability tests cover all production registrations.
- [ ] #4 Drive backend results and TaskManager side effects settle or are fenced through TASK-677's conditional store operations before scheduler finalization.
- [ ] #5 No test.todo remains for B-007 or B-019; their named tests execute and pass with relevant correctness, lint, and typecheck gates.
<!-- AC:END -->
