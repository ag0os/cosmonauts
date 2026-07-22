---
id: TASK-494
title: Stage 8b — Serialize enabled plan transition decisions
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-493
createdAt: '2026-07-22T15:53:40.684Z'
updatedAt: '2026-07-22T15:53:40.684Z'
---

## Description

Implementation stage 8 plan-manager consumer. Owned behavior: B-014 (source AC-006). Depends on the generalized entity-lock and enabled-selection foundation. Implement the concurrent transition cases test-first and place the exact B-014 marker near the executable test.

Own the plan update critical section and flat lock-path derivation in `lib/plans/plan-manager.ts` plus evidence in `tests/plans/plan-manager.test.ts`.

Ratified D-004/D-008 scope: serialize only episode-producing enabled `updatePlan` writers around authoritative read→merge/write→transition decision, release before fail-soft capture, and degrade lock acquisition failures/timeouts to warned unlocked action. Context-free writers and create/delete/archive/other mutation paths remain unchanged and out of scope.

<!-- AC:BEGIN -->
- [ ] #1 B-014 is proven by `tests/plans/plan-manager.test.ts` > `serializes enabled same-plan status transition decisions across manager instances`: same-target and different-target episode-producing writers observe actual serialized persisted statuses, emit only real previous→current transitions, and mark the test with the exact B-014 marker.
- [ ] #2 `lib/plans/plan-manager.ts` keeps authoritative read, not-found handling, merge, primary plan/spec write, and status decision in one enabled critical section, then releases before existing fail-soft episode capture.
- [ ] #3 Per-plan lock files use the canonical plan slug at flat `.cosmonauts/episode-plan-<slug>.lock`, never `missions/` or a nested `.cosmonauts/` directory, leave no final artifact, and remain covered by the existing single-level gitignore rule.
- [ ] #4 Lock errors and bounded waits warn and run the plan update unlocked rather than failing or stalling it; the accepted guarantee covers episode-context writers only and does not claim mutual exclusion with context-free writers.
- [ ] #5 Gate-OFF, absent-gate, context-free, and config-failure plan updates retain current sequential bytes and unlocked behavior, and create/delete/archive or unrelated manager mutations do not enter the new lock.
- [ ] #6 `tests/plans/plan-manager.test.ts`, `bun run lint`, and `bun run typecheck` pass with actual transition-count assertions rather than assertions limited to lock calls.
<!-- AC:END -->
