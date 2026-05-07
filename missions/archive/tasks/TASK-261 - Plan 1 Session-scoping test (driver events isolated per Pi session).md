---
id: TASK-261
title: 'Plan 1: Session-scoping test (driver events isolated per Pi session)'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-258
createdAt: '2026-05-04T17:34:32.998Z'
updatedAt: '2026-05-04T19:55:36.766Z'
---

## Description

Write the session-scoping test proving driver events from one Pi session do not leak to another.

See **Implementation Order step 13**, QC-013, **D-P1-9** in `missions/plans/driver-primitives/plan.md`.

The bus bridge in `index.ts` filters forwarded events by `parentSessionId`. This test verifies that filtering is correct when two concurrent Pi sessions each have an active driver run.

<!-- AC:BEGIN -->
- [x] #1 Two simulated Pi sessions (sessionA, sessionB) are each given their own parentSessionId.
- [x] #2 A driver run scoped to sessionA emits events; only sessionA's pi.sendMessage queue receives those events.
- [x] #3 sessionB's pi.sendMessage queue receives zero events from sessionA's run.
- [x] #4 Tests pass under bun run test --grep 'driver session scoping'.
<!-- AC:END -->

## Implementation Notes

Added tests/extensions/orchestration-driver-session-scoping.test.ts covering two active Pi sessions with distinct parentSessionIds, session-scoped driver_activity/driver_event delivery, and no sessionA leakage into sessionB. Verified: test -f tests/extensions/orchestration-driver-session-scoping.test.ts; bun run test --grep "driver session scoping"; bun run typecheck; bun run lint.
