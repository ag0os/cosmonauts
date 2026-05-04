---
id: TASK-278
title: 'Plan 3: Implement startDetached in driver.ts'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies:
  - TASK-276
  - TASK-270
  - TASK-272
createdAt: '2026-05-04T20:21:19.847Z'
updatedAt: '2026-05-04T20:21:19.847Z'
---

## Description

Implements Implementation Order step 8. Decision Log: D-P3-1, D-P3-3, D-P3-7, D-P3-8, D-P3-12. Quality Contracts: QC-001, QC-002, QC-006, QC-013.

Add `startDetached(spec, deps): DriverHandle` to `lib/driver/driver.ts`, composing backend validation, workdir setup, binary compilation, launch, PID tracking, and bridge startup.

**Cross-plan invariants (ALL apply):**
- P3-INV-2: Write `spec.json` using Plan 1's exact `DriverRunSpec` shape. Do NOT invent a "SerializedDriverRunSpec" type.
- P3-INV-3: Reject `spec.backendName === "cosmonauts-subagent"` with `DetachedNotSupportedError` BEFORE workdir creation. `resolveBackend` also rejects it, but `startDetached` must reject it first.
- P3-INV-6: Parent process does NOT acquire or hold the plan lock. The binary (TASK-276) holds it for the run's duration.
- P3-INV-7: `run.pid` content: `{ pid, startedAt: ISO, runArgv, cosmonautsPath }`. Bash trap removes only `run.pid`. `run.completion.json` is written by the binary.
- P3-INV-9: `Bun.spawn` argv for launching the binary uses an array, not a shell string.
- P3-INV-10: Runtime compile: `bun build --compile <root>/lib/driver/run-step.ts --outfile <workdir>/bin/cosmonauts-drive-step`. The `compile:drive-step` package.json script is separate (step 9).
- P3-INV-11: `bridgeJsonlToActivityBus` started after spawn; bridge handles missing initial JSONL file.

**`startDetached` sequence:**
1. Reject `"cosmonauts-subagent"` before workdir creation.
2. Run `livenessCheck()`; structured error + no workdir on failure (QC-006).
3. Create workdir at `missions/sessions/<plan>/runs/<runId>/`.
4. Render per-task prompts to `workdir/prompts/<taskId>.md`.
5. Write `spec.json` (Plan 1's full `DriverRunSpec` shape).
6. Resolve cosmonauts source root; compile binary via `bun build --compile`.
7. Generate `run.sh` via `generateBashRunner`; write; chmod +x. (OR `Bun.spawn` detached — D-P3-12.)
8. Spawn detached process; capture PID.
9. Write `run.pid: { pid, startedAt, runArgv, cosmonautsPath }`.
10. Start `bridgeJsonlToActivityBus(eventLogPath, runId, deps.parentSessionId, deps.activityBus)`.
11. Return `DriverHandle { runId, planSlug, workdir, eventLogPath, abort, result }`.

<!-- AC:BEGIN -->
- [ ] #1 startDetached(spec, deps) rejects spec.backendName === "cosmonauts-subagent" with a structured error before creating any workdir (P3-INV-3, QC-002).
- [ ] #2 Backend livenessCheck() runs before workdir creation; failure produces a structured error and leaves no partial workdir (QC-006).
- [ ] #3 spec.json is written as Plan 1's DriverRunSpec shape without a separate serialized type (P3-INV-2).
- [ ] #4 Binary compiled via bun build --compile lib/driver/run-step.ts --outfile <workdir>/bin/cosmonauts-drive-step inside startDetached (runtime compile, P3-INV-10); parent process does NOT acquire the plan lock (P3-INV-6).
- [ ] #5 run.pid written with { pid, startedAt, runArgv, cosmonautsPath } after spawn; bridgeJsonlToActivityBus started immediately after (P3-INV-7, P3-INV-11).
- [ ] #6 Returns DriverHandle with runId, workdir, eventLogPath, abort() method, and result promise.
- [ ] #7 End-to-end test in tests/driver/driver-detached.test.ts verifies workdir layout (run.sh, prompts/, spec.json, bin/cosmonauts-drive-step, events.jsonl, run.pid), plan lock owned by binary not parent, JSONL events received by bridge, and run.completion.json written on clean exit (QC-001).
<!-- AC:END -->
