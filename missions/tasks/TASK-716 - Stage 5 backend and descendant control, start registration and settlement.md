---
id: TASK-716
title: 'Stage 5: backend and descendant control, start registration and settlement'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-715
createdAt: '2026-09-23T13:13:12.259Z'
updatedAt: '2026-09-23T13:13:12.259Z'
---

## Description

Execution-liveness Implementation Order stage 5; owns B-001 and B-009 (Design §§2-3, §7-8; D-034). Replace both result-only backend interfaces with D-034, then add: dormant attempt-local controllers, the safe pre-exec broker, Pi start handles, gated nested-run start, exact registration cleanup, zero-target start outcomes, per-target dispatch, local/fresh/run control, and a fixed-grace drain. Do not alter spawn waiter delivery (AC-015 stays deferred). Wire stage 1's fresh-process control ports so status/watch can reconcile from persisted descriptors (review-7 PR-003, D-041). R-018: an adapter that maps an empty target set to delivered stops this stage.

<!-- AC:BEGIN -->
- [ ] #1 B-001: launch exposes the run identity before waiting, and due hard/idle deadlines are enforced by a running framework process and reconciled by the first later trigger after unavailability. After the hard deadline nothing is promoted, and exactly one logical stop is visible. A watchdog, scheduler or resume trigger settles within fixed grace. A cancelled status/watch caller returns the durable disposition, and the next trigger keeps the original grace.
- [ ] #2 B-009: terminalization waits for the backend and every registered descendant; a nested run is reconciled by RunRef, never through a fabricated process control. An attempt that crashes before registering any target stays pending/start-unconfirmed and blocks at its original grace.
- [ ] #3 A fresh status/watch process, with no in-memory handle, reaches settlement of a persisted process, Pi-session and nested-run descendant through the stage 1 control ports (review-7 PR-003; review-4 PR-001's fresh half).
- [ ] #4 Project-controlled Pi extension startup that runs before Pi-session registration (session-factory loads extension paths before sessionId exists) is either covered by the attempt-local abort or refused/contained, and the chosen outcome is tested (review-7 Missing Coverage).
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
