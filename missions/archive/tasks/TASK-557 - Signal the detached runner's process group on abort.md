---
id: TASK-557
title: Signal the detached runner's process group on abort
status: Done
priority: high
labels:
  - 'plan:drive-process-reaping'
dependencies: []
createdAt: '2026-08-10T18:47:50.217Z'
updatedAt: '2026-08-10T19:09:22.535Z'
---

## Description

B-004. `signalDetachedChild` (lib/driver/driver.ts:276) sends
`process.kill(pid, signal)`. `run.sh` execs the step binary, so that pid IS
the step binary — but the backend process is its child, and POSIX
kill-by-pid does not reach children. Move to `process.kill(-pid, ...)`.

Safe under INV-4 because the runner is spawned `detached: true` and is
therefore its own group leader; the driver process never belongs to that
group. Negate only pids this code detached — never an arbitrary pid.

tests/driver/driver-detached.test.ts:824 (TASK-500 PR-001) asserts
`kill.mock.calls.filter(([pid]) => pid === sentinelPid)`. That becomes
`-sentinelPid` by construction. Update the assertion and the escalation
order together.

<!-- AC:BEGIN -->
- [ ] #1 signalDetachedChild addresses the runner's group, and the negation is applied only to a pid spawned detached by this code.
- [ ] #2 The pinned abort test passes with its elapsedMs bound (2_800-8_000) still asserted directly, and its escalation order still ['SIGTERM','SIGKILL'].
- [ ] #3 All five @cosmo-behavior markers in tests/driver/driver-detached.test.ts are still present and still paired.
- [ ] #4 The abort path still settles on a bounded deadline (INV-3); correct reaping does not turn a bounded abort into an unbounded wait.
- [ ] #5 A test proves the driver's own process group is not signalled — the parent survives an abort.
<!-- AC:END -->
