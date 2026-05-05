---
id: TASK-276
title: 'Plan 3: Implement run-step Bun binary entry point'
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-274
createdAt: '2026-05-04T20:20:57.252Z'
updatedAt: '2026-05-05T15:37:09.977Z'
---

## Description

Implements Implementation Order step 5. Decision Log: D-P3-1, D-P3-7. Quality Contracts: QC-001, QC-011, QC-013.

Create `lib/driver/run-step.ts` as the Bun binary entry point. This process runs for the entire lifetime of a detached run — one invocation per detached run.

**Cross-plan invariants (ALL must be observed):**
- P3-INV-1: Binary calls Plan 1's `runRunLoop` directly — do NOT inline the run loop. Binary acquires plan lock itself, constructs backend via registry, calls `new TaskManager(spec.projectRoot)` then `await taskManager.init()` (NOT `initialize()`), then calls `runRunLoop(spec, ctx)`. Writes `run.completion.json` BEFORE releasing lock.
- P3-INV-2: Deserializes `<workdir>/spec.json` into the exact Plan 1 `DriverRunSpec` shape. Do NOT define a separate "SerializedDriverRunSpec" type.
- P3-INV-4: Method is `taskManager.init()`, NOT `initialize()`. Verified at `lib/tasks/task-manager.ts:54-60`. Status literals Title Case.
- P3-INV-6: `acquirePlanLock(planSlug, runId, projectRoot)` — acquired before `runRunLoop`; released in `finally`.
- P3-INV-7: `run.completion.json` written with final `DriverResult` BEFORE releasing the lock and exiting.
- P3-INV-10: Compiled via `bun build --compile lib/driver/run-step.ts`.

**Entry point sequence:**
1. Parse `--workdir` CLI arg.
2. Read + deserialize `<workdir>/spec.json` as `DriverRunSpec` (Plan 1 shape).
3. Acquire plan lock via `acquirePlanLock(spec.planSlug, spec.runId, spec.projectRoot)`.
4. `resolveBackend(spec.backendName, deps)` — throws for `"cosmonauts-subagent"`.
5. `new TaskManager(spec.projectRoot)` + `await taskManager.init()`.
6. `createEventSink({ logPath: spec.eventLogPath, ... })`.
7. `result = await runRunLoop(spec, ctx)`.
8. `await writeFile(workdir/run.completion.json, JSON.stringify(result))`.
9. Release plan lock in `finally`.
10. `process.exit(result.outcome === "completed" ? 0 : 1)`.

<!-- AC:BEGIN -->
- [ ] #1 lib/driver/run-step.ts reads <workdir>/spec.json as Plan 1's DriverRunSpec without defining a separate serialized type (P3-INV-2).
- [ ] #2 Binary acquires plan lock via acquirePlanLock before entering runRunLoop and releases it in finally; calls taskManager.init() not initialize() per P3-INV-1 and P3-INV-4.
- [ ] #3 run.completion.json is written with the final DriverResult before the plan lock is released (P3-INV-7).
- [ ] #4 Binary exits 0 on outcome === "completed", exits 1 otherwise.
- [ ] #5 Compiles successfully via bun build --compile lib/driver/run-step.ts --outfile <outfile>.
- [ ] #6 Test in tests/driver/run-step.test.ts compiles the binary, invokes it against a fixture workdir with a mock backend, and verifies: lock acquired, runRunLoop called, run.completion.json written with expected DriverResult.
- [ ] #7 Binary runs correctly without the cosmonauts source tree present (move source; invoke binary; verify completion record written — QC-011).
<!-- AC:END -->

## Implementation Notes

Implemented lib/driver/run-step.ts Bun binary entry point. It reads spec.json as DriverRunSpec, acquires/release plan lock, resolves backend via registry with env binary overrides, initializes TaskManager.init(), creates EventSink, calls runRunLoop directly in detached mode, and writes run.completion.json before releasing the lock. Added tests/driver/run-step.test.ts compiling and invoking the binary with fake Codex backend, verifying events, completion record, task status, and active-lock failure. Verified focused run-step test, typecheck, and lint pass.
