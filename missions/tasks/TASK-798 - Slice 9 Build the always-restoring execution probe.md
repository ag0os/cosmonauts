---
id: TASK-798
title: 'Slice 9: Build the always-restoring execution probe'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-797
createdAt: '2026-09-29T16:46:47.274Z'
updatedAt: '2026-09-29T16:46:47.274Z'
---

## Description

Implementation Order slice 9. Owns B-008 from AC-012 as amended by human ruling H-001. Design ownership: §6 Execution probe and the shared destructive-Git classifier contract from §7 only as needed to gate the probe command. Governed by D-001, D-002, D-003, D-011, D-012, D-013 as superseded, D-015, D-016, D-019, D-025, D-027, D-028, and D-030.

Files to Change owned by this slice: `bundled/coding/agents/worker.ts`, `bundled/coding/capabilities/execution-probe.md`, `bundled/coding/extensions/execution-probe/index.ts`, `lib/agents/drive-worker-tool-guard.ts` for the reusable classifier contract consumed by the probe, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md` for journal blocking, and `domains/shared/skills/drive/SKILL.md` for the probe-journal contract. Nothing under `domains/shared/extensions/execution-probe/` or `domains/shared/capabilities/execution-probe.md` is created.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §6 under one project-wide `withEntityFileLock`: recover or refuse an outstanding journal; classify the command; validate tracked regular contained non-symlink locations and stable digests; durably fsync/verify mode-0700 sidecars and manifest before mutation; batch same-file markers in descending line order; execute exactly once through the existing provider process runner with timeout; restore and digest-check every instrumented file in `finally`; compare tracked status for side effects; retain a named journal and return `recovery-required` on unverifiable restore. Make both Drive paths block before postflight or commit while a journal remains. Use no persisted process identity, supervisor, or arm gate.

<!-- AC:BEGIN -->
- [ ] #1 B-008 (source AC-012 as amended by H-001): the coding-worker-only `execution_probe` runs one confirmed project command and reports per-location hit counts and exit status; supports multiple same-file locations; restores each instrumented file to its original digest on pass, failure, timeout, and abort; reports other tracked-path changes as side effects; marks zero usable only after exit 0, verified restoration, and no side effects; refuses invalid locations, locations whose bytes changed between validation and instrumentation, a project with an outstanding probe journal, and destructive Git commands, while a git-dirty tracked file is probeable; and returns a named `recovery-required` journal rather than a count when restoration cannot be verified.
- [ ] #2 The slice’s Prove clause is satisfied: pass, failure, timeout, and abort all restore; a side effect invalidates zero; changed-since-validation is refused; outstanding journals are refused or recovered on the next call; a corrupt sidecar yields `recovery-required` and Drive blocks before postflight and commit; symlink, escape, non-regular, and duplicate locations are refused; multiple lines in one file work; a destructive test command is refused; a tracked file with uncommitted working-tree changes relative to HEAD is probed successfully (hit counts returned, file restored to its pre-probe uncommitted digest); and an outstanding journal present at run start blocks the task in Drive preflight with no spawn.
- [ ] #3 The owned Files to Change (`bundled/coding/agents/worker.ts`, `bundled/coding/capabilities/execution-probe.md`, `bundled/coding/extensions/execution-probe/index.ts`, `lib/agents/drive-worker-tool-guard.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`) deliver Design §6 and the probe’s §7 classifier dependency; the extension remains coding-worker-only; on both the graph and legacy paths, Drive's preflight and its postflight each check the project's probe journal directory and an outstanding journal blocks the task with a `recovery-required` reason naming the journal before any worker spawn, postflight command, or commit; `lib/agents/drive-worker-tool-guard.ts` is created here with the complete pure classifier of Design §7 (every listed destructive family and executable-position form), proven by its own red/green rows, and the probe consumes it; and no PID/process-group identity, detached supervisor, or arm gate is introduced.
- [ ] #4 Ratified ground binds exactly: “INV-006 - Task state and the worktree change only through validated paths. Worker-supplied task fields are validated before they reach task files, and a worker cannot discard uncommitted work left by a previous attempt.” “AC-012 - A worker-invocable execution-probe helper takes one or more source locations and a test command, reports the hit count per location under that command, restores every instrumented file to its original digest whether the command passed, failed, timed out, or was aborted, and reports any other tracked-file change the command made as a side effect that invalidates the hit evidence; the worker protocol requires a recorded, usable zero hit count from it before a `blocked` stop that claims a site is unreached.” H-001 (i): AC-012 is amended on record to that letter. H-001 (ii): “dirty means the target's bytes changed between the digest taken at validation and the instrumentation write, or an outstanding probe journal exists for the project; git-dirty files are probeable.” Q-002(a) remains a temporary live-file edit with digest-verified restoration. Any collision is stop-and-escalate ground, not worker-adjustable detail.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). No count is reported without verified restoration, and explicit project-execution confirmation is required.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: for B-008, implementation notes record one failing run before the change and one passing run after it; each row includes the test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
