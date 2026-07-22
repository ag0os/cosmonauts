---
id: TASK-495
title: Stage 8c — Serialize enabled task transition decisions
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-493
createdAt: '2026-07-22T15:53:55.648Z'
updatedAt: '2026-07-22T15:53:55.648Z'
---

## Description

Implementation stage 8 task-manager consumer. Owned behavior: B-015 (source AC-006). Depends on the generalized entity-lock and enabled-selection foundation. Implement mixed-case concurrent transition cases test-first and place the exact B-015 marker near the named executable test.

Own the task update critical section and canonical lock-path derivation in `lib/tasks/task-manager.ts`, behavior evidence in `tests/tasks/task-manager-concurrency.test.ts` and `tests/tasks/task-manager.test.ts`, and scanner/archive safety evidence in `tests/plans/archive.test.ts`.

Ratified constraints: entity locks are flat under `.cosmonauts/`, never under `missions/`; the task path derives from the canonical UPPERCASED task id so `TASK-001`, `task-001`, and `Task-001` share one lock. Acquisition remains fail-soft and bounded, and capture occurs after release.

<!-- AC:BEGIN -->
- [ ] #1 B-015 is proven by `tests/tasks/task-manager-concurrency.test.ts` > `serializes enabled same-task updates and records only actual status transitions`: same/different target updates, filename-changing status transitions, and mixed-case task IDs produce the actual persisted transition count with no lost or duplicate file, with the exact B-015 marker.
- [ ] #2 `lib/tasks/task-manager.ts` keeps authoritative read, not-found check, old filename selection, merge, write/rename, and status decision in one enabled critical section, then releases before existing fail-soft episode capture.
- [ ] #3 Every task lock path is flat `.cosmonauts/episode-task-<CANONICAL-UPPERCASED-ID>.lock`; no lock is created in `missions/tasks/` or a nested `.cosmonauts/` directory, and case variants of one task cannot acquire different locks.
- [ ] #4 `tests/plans/archive.test.ts` proves `missions/tasks/` contains no non-`.md` entry during or after locked updates and git status remains unchanged, so the archive prefix scan cannot select or move a lock file.
- [ ] #5 Lock errors and bounded waits warn and run the task update unlocked; gate-OFF, absent-gate, context-free, and config-failure task updates retain current bytes and unlocked behavior, while create/delete/archive and unrelated mutations remain out of scope.
- [ ] #6 `tests/tasks/task-manager.test.ts`, `tests/tasks/task-manager-concurrency.test.ts`, `tests/plans/archive.test.ts`, `bun run lint`, and `bun run typecheck` pass with no residual or git-visible lock artifact.
<!-- AC:END -->
