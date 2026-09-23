---
id: TASK-715
title: 'Stage 4: host clock, activity, renewal and ownership regain'
status: To Do
priority: high
labels:
  - 'plan:execution-liveness'
  - backend
dependencies:
  - TASK-714
createdAt: '2026-09-23T13:13:11.733Z'
updatedAt: '2026-09-23T13:13:11.733Z'
---

## Description

Execution-liveness Implementation Order stage 4; owns B-002, B-003, B-004 and B-008 (Design §6, §7, §9). Cover fresh observers, suspension, epoch change, a backward wall clock, repeated polling, both hard proofs, and every reconciliation trigger before owner-lapse handling. R-006: PID alone, process-relative time, or an uptime that counts sleep is insufficient. R-009: prefer losing work over extending a hard ceiling without evidence.

<!-- AC:BEGIN -->
- [ ] #1 B-002: each shadow idle crossing yields exactly one durable would-have-cancelled decision at the first framework opportunity. The attempt stays eligible, and polling duplicates neither the decision nor the event.
- [ ] #2 B-003: useful activity starts a new idle window, renewal changes only proof of life, active work survives repeated windows, and heartbeat-only work reaches the configured shadow/enforce outcome.
- [ ] #3 B-004: detected host-unavailable time is reported and excluded from idle. Before the hard ceiling the exact authority resumes; at or after it, promotion is fenced and the first framework action reconciles.
- [ ] #4 B-008: deadline/grace reconciliation runs first. An exact alive owner stays expired-but-held, a dead owner blocks, and an uncheckable owner gets one lease of grace and then blocks. No replacement starts in the run.
- [ ] #5 check-artifacts, lint, typecheck and the full suite pass.
<!-- AC:END -->
