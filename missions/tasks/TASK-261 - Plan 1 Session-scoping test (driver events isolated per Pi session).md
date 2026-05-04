---
id: TASK-261
title: 'Plan 1: Session-scoping test (driver events isolated per Pi session)'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:driver-primitives'
dependencies:
  - TASK-258
createdAt: '2026-05-04T17:34:32.998Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Write the session-scoping test proving driver events from one Pi session do not leak to another.

See **Implementation Order step 13**, QC-013, **D-P1-9** in `missions/plans/driver-primitives/plan.md`.

The bus bridge in `index.ts` filters forwarded events by `parentSessionId`. This test verifies that filtering is correct when two concurrent Pi sessions each have an active driver run.

<!-- AC:BEGIN -->
- [ ] #1 Two simulated Pi sessions (sessionA, sessionB) are each given their own parentSessionId.
- [ ] #2 A driver run scoped to sessionA emits events; only sessionA's pi.sendMessage queue receives those events.
- [ ] #3 sessionB's pi.sendMessage queue receives zero events from sessionA's run.
- [ ] #4 Tests pass under bun run test --grep 'driver session scoping'.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
