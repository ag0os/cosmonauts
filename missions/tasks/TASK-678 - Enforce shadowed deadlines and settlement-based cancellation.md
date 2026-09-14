---
id: TASK-678
title: Enforce shadowed deadlines and settlement-based cancellation
status: To Do
priority: high
labels:
  - backend
  - orchestration
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-684
createdAt: '2026-09-11T13:25:38.084Z'
updatedAt: '2026-09-13T04:03:38.655Z'
---

## Description

Implement B-004, B-005, B-006, B-016, B-017, B-018, B-020, and B-021 after scheduler writers are fenced. Add shadow and enforce watchdog modes, persisted cancellation intent, settlement-based bounded confirmation, suspension-aware idle evaluation, safe terminal-blocked outcomes, and reachability-aware run finalization.

<!-- AC:BEGIN -->
- [ ] #1 B-020 adds explicit shadow and enforce modes with shadow as default; shadow emits durable would-cancel evidence without aborting attempts or descendants.
- [ ] #2 B-004 enforce mode persists cancellationRequested and deadline source before issuing exactly one abort, then reaches a terminal or terminal-blocked outcome within grace.
- [ ] #3 B-016 confirms each cancellation hop only when its result settles within grace or the backend reports equivalent settlement; cancel acknowledgement alone remains unconfirmed; the pinned durable-graph-scheduler#B-019 test in tests/durable-runtime/scheduler-cancellation.test.ts ("cancels active backend on signal and preserves running evidence when cancellation is unsupported") is retargeted to settlement semantics with its marker kept.
- [ ] #4 B-006 treats every unconfirmed attempt as mutating, revokes its token, records execution identity, ends terminal-blocked, and permits no same-run replacement.
- [ ] #5 B-005 useful activity resets idle time, active work survives the idle window, and no implicit hard timeout is introduced.
- [ ] #6 B-017 records and rebases idle time after host clock discontinuity, while B-018 terminalizes a run when no pending step can become runnable.
- [ ] #7 B-021 quarantines an expired lease held by no live owner: after any clock-discontinuity rebase and with no settlement evidence, the step becomes terminal-blocked recording lease_expired and holder identity, the token is revoked, no replacement attempt starts, and the run finalizes; shadow mode records would-quarantine only.
- [ ] #8 No test.todo remains for B-004, B-005, B-006, B-016, B-017, B-018, B-020, or B-021; their named tests execute and pass with relevant correctness, lint, and typecheck gates.
<!-- AC:END -->
