---
id: TASK-799
title: 'Slice 10: Guard Drive Git operations and snapshot dirty work'
status: To Do
priority: high
labels:
  - backend
  - devops
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-798
createdAt: '2026-09-29T16:47:14.963Z'
updatedAt: '2026-09-29T16:47:14.963Z'
---

## Description

Implementation Order slice 10. Owns B-009 from AC-014 and the worktree-snapshot clauses of B-011 (whose declared sources are AC-015 and AC-017; D-020 supplies the snapshot mechanism required by INV-006 alongside AC-014). Design ownership: §7 Drive worker Git guard and snapshot. Governed by D-001, D-003, D-011, D-012, D-015, D-020, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/agents/drive-worker-tool-guard.ts`, `lib/agents/session-assembly.ts`, `lib/driver/types.ts` for `worktreeSnapshot`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts` for terminal ref cleanup, `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`, and `docs/orchestration.md` for guard residuals and snapshot recovery.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §7: complete the pure executable-position Git classifier and use it both from the probe and a blocking Pi `tool_call` extension composed only when `parentRole === "driver"`; leave tool resolution and non-Drive sessions untouched. Before every spawn on every backend, snapshot dirty tracked and untracked state without applying stash state, write the commit object under the run/task/attempt ref, put that ref in the Drive note and next `spawn_started`, and delete refs only for Done tasks.

<!-- AC:BEGIN -->
- [ ] #1 B-009 (source AC-014) and the snapshot clauses of B-011 (declared sources AC-015, AC-017; snapshot authority D-020/INV-006) are delivered: destructive Git in executable position is blocked only in Drive Pi workers with the safety rule, recoverable snapshot ref, and alternative; read-only Git and add/commit remain unaffected; before every dirty-worktree spawn on every backend and on both Drive paths, a resolvable run-scoped snapshot ref named `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` is recorded in the attempt note and `spawn_started`, retained for blocked/partial/aborted tasks, and removed only for Done tasks; the snapshot commit contains both tracked modifications and untracked non-ignored files; the guard resolves the latest ref under `refs/cosmonauts/drive/*/<taskId>/` from the runtime task ID for its refusal text, and when no snapshot exists the refusal says so instead of naming a ref.
- [ ] #2 The slice’s Prove clause is satisfied for Drive versus non-Drive sessions; executable position versus quoted prose; separators, `env`/`command` prefixes, `-C`, `-c`, `--git-dir`/`--work-tree`, and `sh -c`/`bash -c`/`eval`; every listed destructive family; unaffected read-only Git and add/commit; a snapshot taken with a modified tracked file and a new untracked non-ignored file that restores both byte for byte after a simulated `git checkout -- . && git clean -fd`, on both Drive paths; and refs retained on Blocked and removed on Done.
- [ ] #3 The owned Files to Change (`lib/agents/drive-worker-tool-guard.ts`, `lib/agents/session-assembly.ts`, `lib/driver/types.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`, `docs/orchestration.md`) deliver Design §7 by consuming the classifier TASK-798 created, unchanged, and adding only the Drive-only `tool_call` composition, refusal text, and snapshot creation and cleanup; Design §7 is delivered across classifier, Drive-only Pi composition, all-backend snapshot creation, event/note contracts, cleanup, and documented residuals; snapshot creation never applies stash state to the worktree.
- [ ] #4 Ratified ground binds exactly: “INV-006 - Task state and the worktree change only through validated paths. Worker-supplied task fields are validated before they reach task files, and a worker cannot discard uncommitted work left by a previous attempt.” “Ranking. INV-006 wins over worker autonomy: a guard that refuses a destructive git command is preferred to a prompt rule the worker may ignore.” Human-reviewed D-020 stands: every backend snapshots the dirty worktree before every spawn. Any collision, including inability of pinned Pi to block `tool_call`, stops for recorded disposition under the deviation protocol rather than silently narrowing coverage.
- [ ] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). Command substitution, aliases, and redirect-overwrite remain documented classifier residuals covered by snapshots, not hidden as complete classification.
- [ ] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [ ] #7 D-030: implementation notes contain separate red/green evidence rows for B-009 and the owned snapshot clauses of B-011; for each owned behavior portion, one failing run before the change and one passing run after it are recorded with test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->
