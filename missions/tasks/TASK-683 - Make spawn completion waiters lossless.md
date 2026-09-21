---
id: TASK-683
title: Make spawn completion waiters lossless
status: To Do
priority: high
labels:
  - orchestration
  - concurrency
  - testing
  - 'plan:execution-liveness'
dependencies:
  - TASK-678
createdAt: '2026-09-13T04:02:33.641Z'
updatedAt: '2026-09-21T16:27:14.515Z'
---

## Description

Deliver B-011 (`execution-liveness` plan), independently of deadline policy. Today, when a parent's five-minute wait for spawn completions expires, the children still running are reported to it as failed. Wait expiry is an observation limit, not a child deadline: make giving up a wait end only that wait.

The observer is an agent that called `spawn_agent`; the entry point is that tool and the completion messages it promises. Test design is yours — drive the behavior through that entry point, not through helpers only a test would call.

<!-- AC:BEGIN -->
- [ ] #1 B-011 A parent whose wait expires or is cancelled is not told that a still-healthy child failed or timed out, and that child keeps running.
- [ ] #2 B-011 When that child later finishes, the parent receives its real result exactly once — on its next wait, or buffered for a later one. With several children, one abandoned wait neither swallows nor duplicates another child's completion.
- [ ] #3 B-011 A completion that arrives when nobody is waiting does not throw, is attributed to the right spawn, and never records a successful child as failed.
- [ ] #4 A child is cancelled only when the attempt that owns it is cancelled. Existing maximum spawn concurrency and depth rejection are unchanged; semaphore queueing stays out of scope.
- [ ] #5 The code behavior is protected by tests designed after seeing the code, driven through the shipped entry point, and each seen to fail against deliberately broken logic; correctness, lint, and typecheck gates pass.
<!-- AC:END -->

## Implementation Notes

An implementation exists and is NOT merged: commit 7c8811b on branch trial/b011-format-trial (worktree /Users/cosmos/Projects/cosmonauts-trial-b011), produced 2026-09-20 as the framework-health format trial. Its tests were mutation-probed (11 of 11 killed; see missions/plans/framework-health/trial-d009.md). Before landing it: (1) it has not been through the quality-manager or an independent code review — the probes show its tests can fail, not that its design is right; (2) do not ship it ahead of TASK-678: with wait expiry no longer failing children, a hung child keeps the parent's loop waiting indefinitely, and until hard deadlines land the only bound is the caller's abort signal. Dependency on TASK-678 added for that reason (human decision, 2026-09-21). It also fixes a pre-existing silent drop — the old loop could exit with a completion still buffered when two children settled in one tick — which has not been independently reproduced on the base.
