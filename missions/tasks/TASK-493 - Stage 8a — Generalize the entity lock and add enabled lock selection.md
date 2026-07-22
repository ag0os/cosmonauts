---
id: TASK-493
title: Stage 8a — Generalize the entity lock and add enabled lock selection
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-489
createdAt: '2026-07-22T15:53:28.656Z'
updatedAt: '2026-07-22T21:07:33.100Z'
---

## Description

Implementation stage 8 foundation. Owned behaviors: none; B-014 and B-015 remain solely owned by the plan-manager and task-manager consumer tasks. Depends only on the atomic stages 1–5 checkpoint, so it may proceed independently of stages 6–7.

Own `lib/tasks/lock.ts`, new `lib/memory/episode-transition-lock.ts`, and new `tests/memory/episode-transition-lock.test.ts`.

Ratified constraints: do not author a new filesystem lock protocol. Generalize the existing task lock into path-parameterized `withEntityFileLock(lockPath, fn)` and keep task creation as a thin caller; the repository lock-protocol implementation count must not increase. Transition locking is fail-soft and bounded: acquisition error or timeout warns once and runs the primary action unlocked, never failing or stalling a plan/task update (D-008). The episodic gate remains OFF by default.

<!-- AC:BEGIN -->
- [x] #1 `lib/tasks/lock.ts` exposes a path-parameterized entity-lock primitive while preserving `withTaskCreateLock` as a thin compatibility caller and retaining exclusive create, bounded wait, PID-plus-nonce ownership, stale recovery, owner-checked release, and idempotence.
- [x] #2 `lib/memory/episode-transition-lock.ts` owns only episode-context and project-gate selection, depends on neither plan nor task manager modules, and delegates acquisition to the generalized primitive rather than copying a lock protocol.
- [x] #3 Absent episode context, absent/false gate, and config-load failure execute the action directly with current manager semantics; only literal enabled plus episode context attempts entity locking, and the gate default remains OFF.
- [x] #4 Lock acquisition errors and bounded-wait timeouts emit one established episode warning and run the action unlocked; no lock failure can fail or indefinitely stall a primary plan/task update.
- [x] #5 `tests/memory/episode-transition-lock.test.ts` proves enabled acquisition/wait/stale cleanup/owner release, every bypass case, and fail-soft unlocked degradation, while existing task-lock behavior remains green.
- [x] #6 The repository count of filesystem lock-protocol implementations does not increase, no in-memory mutex or MemoryStore/schema surface is introduced, and no lock is placed under `missions/` by this foundation.
- [x] #7 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass, including exact OFF-state bypass evidence.
<!-- AC:END -->
