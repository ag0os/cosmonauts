---
id: TASK-499
title: Review fix — restore OFF terminal-hook parity
status: Done
priority: high
labels:
  - review-fix
  - 'review-round:1'
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T22:05:08.039Z'
updatedAt: '2026-07-24T03:26:23.832Z'
---

## Description

**CLOSED 2026-07-24 by decision, not by implementation. See D-006 in
`missions/plans/episodic-log-detached-hardening/plan.md`.**

Original framing: the `onTerminalPersisted` hook and the swallowing/retry
backstop are installed unconditionally, including for source-less/gate-OFF runs,
so a failing plan-lock release diverges from `main` in both event bytes (an
added `terminal_persisted_hook_failed` diagnostic) and rejection semantics
(resolves rather than rejects).

Resolution: the divergence is **accepted and named**, because AC-001 and B-023
are mutually exclusive on this path and the new behavior is the better one — a
run that already persisted its completion should not be reported as failed
because post-run lock cleanup failed. AC-001 (spec.md) and B-001 (plan.md) were
narrowed in text to name this single exclusion. Restoring parity was considered
and rejected: it would reinstate `main`'s worse semantics and add a second
untested code path in both `driver.ts` and `run-step.ts`.

Scope of the accepted divergence: gate-OFF **and** plan-lock release failure,
only. Any OFF divergence on a non-failure path remains a hard failure.

<!-- AC:BEGIN -->
- [x] #1 The OFF release-failure divergence is recorded as a ratified decision (D-006) with its rejected alternatives, rather than left as silent drift.
- [x] #2 AC-001 in spec.md and B-001 in plan.md name the exclusion explicitly and restate that all other OFF paths stay byte-identical.
- [x] #3 Enabled identity-bearing hook rejection remains isolated from the broad catch, emits no second terminal, and skips capture — unchanged, verified by B-023.
- [x] #4 Successful terminal order remains stamp → terminal event → completion → hook → capture — unchanged, verified by B-005/B-016.
- [x] #5 Full verification stays green with no code change.
<!-- AC:END -->
