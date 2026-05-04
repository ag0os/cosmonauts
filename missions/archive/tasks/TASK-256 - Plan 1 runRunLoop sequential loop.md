---
id: TASK-256
title: 'Plan 1: runRunLoop sequential loop'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-255
createdAt: '2026-05-04T17:33:46.388Z'
updatedAt: '2026-05-04T19:30:42.812Z'
---

## Description

Implement `lib/driver/run-run-loop.ts` and `tests/driver/run-run-loop.test.ts`.

See **Implementation Order step 7**, **D-P1-11**, **Approach > runRunLoop body**, QC-006, QC-014 in `missions/plans/driver-primitives/plan.md`.

Cross-plan invariant: `runRunLoop` MUST be exported as a named export from `lib/driver/run-run-loop.ts`. Plan 3's compiled binary acquires its own plan lock then calls `runRunLoop` directly — it does not call `runInline`. The loop body (run-level events, partialMode handling, EventLogWriteError catch) MUST live here, not folded into `runInline`.

Loop body:
1. Emit `run_started`
2. For each taskId: call `runOneTask`; handle `blocked` (emit `run_aborted`, break) and `partial+stop` (emit `run_aborted`, break)
3. Emit `run_completed` with summary
4. Top-level catch on `EventLogWriteError`: best-effort sync write of `run_aborted("log write failed")`; return aborted result.

<!-- AC:BEGIN -->
- [x] #1 runRunLoop(spec: DriverRunSpec, ctx: RunRunLoopCtx): Promise<DriverResult> is exported as a named export from lib/driver/run-run-loop.ts.
- [x] #2 Emits run_started before the task loop begins; emits run_completed with {total, done, blocked} summary after all tasks finish cleanly.
- [x] #3 blocked outcome from runOneTask: emits run_aborted and breaks the loop; returns DriverResult{outcome:'blocked'}.
- [x] #4 partial outcome with spec.partialMode !== 'continue': emits run_aborted('partial: stopping per partialMode') and breaks.
- [x] #5 partial outcome with spec.partialMode === 'continue': proceeds to the next task without aborting.
- [x] #6 EventLogWriteError caught at top level: best-effort sync write of run_aborted('log write failed'); returns DriverResult{outcome:'aborted'}.
- [x] #7 tests/driver/run-run-loop.test.ts covers run_started/completed/aborted emission, partialMode:stop, partialMode:continue, and EventLogWriteError abort; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Verified and fixed `runRunLoop` so `run_completed` is emitted only for clean finishes; blocked and partial-stop paths emit `run_aborted` and return without completion. EventLogWriteError fallback writes `run_aborted("log write failed")` and returns aborted with the reason. Verified: `bun run test --grep "run-run-loop"`, `bun run typecheck`, `bun run lint`. Committed 93a3de7.
