---
id: TASK-556
title: Reap the backend process tree in the codex and claude-cli backends
status: Done
priority: high
labels:
  - 'plan:drive-process-reaping'
dependencies:
  - TASK-554
  - TASK-555
createdAt: '2026-08-10T18:47:50.215Z'
updatedAt: '2026-08-10T18:59:54.861Z'
---

## Description

The fix for the observed leak (B-001, B-002, B-003, B-005). Both backends
share the defect verbatim, so both change together.

Spawn with `detached: true` on POSIX so the child leads its own process
group (verified honoured by Bun 1.2.22). After `child.exited` resolves,
reap the remaining group — SIGTERM, bounded grace, SIGKILL — and only then
await the stdout/stderr promises. The ordering is the point (D-004):
killing the pipe holders is what lets the drain terminate.

`BunSpawnOptions` in `lib/driver/backends/bun-runtime.ts` gains `detached`.
Per D-005, win32 keeps today's direct-child-only behaviour.

<!-- AC:BEGIN -->
- [ ] #1 Both backends spawn detached on POSIX and reap their group after the direct child exits, before draining stdout/stderr.
- [ ] #2 The reap escalates an ignored SIGTERM to SIGKILL on a bounded deadline, asserted directly in the B-003 test rather than inferred from a helper default.
- [ ] #3 B-005: a group that survives escalation is surfaced on the run's channels and is never folded into a clean task result.
- [ ] #4 The B-001 and B-002 tests from the previous task now pass, and the returned exitCode/stdout contract is unchanged for the ordinary no-descendant case.
- [ ] #5 Existing tests/driver/backends/codex.test.ts and claude-cli coverage stay green, including 'run forwards abort signals to the child process'.
- [ ] #6 INV-5 holds: the completion path does not acquire the start-only residual episodic-log#B-019 permits for a hard-killed fire-and-forget child.
<!-- AC:END -->
