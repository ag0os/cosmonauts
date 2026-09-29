---
id: TASK-799
title: 'Slice 10: Guard Drive Git operations and snapshot dirty work'
status: Done
priority: high
labels:
  - backend
  - devops
  - testing
  - 'plan:driver-hardening'
dependencies:
  - TASK-798
createdAt: '2026-09-29T16:47:14.963Z'
updatedAt: '2026-09-29T19:54:41.623Z'
---

## Description

Implementation Order slice 10. Owns B-009 from AC-014 and the worktree-snapshot clauses of B-011 (whose declared sources are AC-015 and AC-017; D-020 supplies the snapshot mechanism required by INV-006 alongside AC-014). Design ownership: §7 Drive worker Git guard and snapshot. Governed by D-001, D-003, D-011, D-012, D-015, D-020, D-023, D-027, D-028, and D-030.

Files to Change owned by this slice: `lib/agents/drive-worker-tool-guard.ts`, `lib/agents/session-assembly.ts`, `lib/driver/types.ts` for `worktreeSnapshot`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts` for terminal ref cleanup, `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`, and `docs/orchestration.md` for guard residuals and snapshot recovery.

**Standing worker rule until TASK-801 aligns the persona (D-028):** write every implementation note, including the D-030 red/green rows, with `task_edit` `implementationNotesMode: "append"`; never replace notes; if you stop blocked, set status Blocked and end the report with `outcome: blocked`.

## Implementation Plan

Follow Design §7: complete the pure executable-position Git classifier and use it both from the probe and a blocking Pi `tool_call` extension composed only when `parentRole === "driver"`; leave tool resolution and non-Drive sessions untouched. Before every spawn on every backend, snapshot dirty tracked and untracked state without applying stash state, write the commit object under the run/task/attempt ref, put that ref in the Drive note and next `spawn_started`, and delete refs only for Done tasks.

<!-- AC:BEGIN -->
- [x] #1 B-009 (source AC-014) and the snapshot clauses of B-011 (declared sources AC-015, AC-017; snapshot authority D-020/INV-006) are delivered: destructive Git in executable position is blocked only in Drive Pi workers with the safety rule, recoverable snapshot ref, and alternative; read-only Git and add/commit remain unaffected; before every dirty-worktree spawn on every backend and on both Drive paths, a resolvable run-scoped snapshot ref named `refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n>` is recorded in the attempt note and `spawn_started`, retained for blocked/partial/aborted tasks, and removed only for Done tasks; the snapshot commit contains both tracked modifications and untracked non-ignored files; the guard resolves the latest ref under `refs/cosmonauts/drive/*/<taskId>/` from the runtime task ID for its refusal text, and when no snapshot exists the refusal says so instead of naming a ref.
- [x] #2 The slice’s Prove clause is satisfied for Drive versus non-Drive sessions; executable position versus quoted prose; separators, `env`/`command` prefixes, `-C`, `-c`, `--git-dir`/`--work-tree`, and `sh -c`/`bash -c`/`eval`; every listed destructive family; unaffected read-only Git and add/commit; a snapshot taken with a modified tracked file and a new untracked non-ignored file that restores both byte for byte after a simulated `git checkout -- . && git clean -fd`, on both Drive paths; and refs retained on Blocked and removed on Done.
- [x] #3 The owned Files to Change (`lib/agents/drive-worker-tool-guard.ts`, `lib/agents/session-assembly.ts`, `lib/driver/types.ts`, `lib/driver/runtime-helpers.ts`, `lib/driver/run-one-task.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/drive-finalization.ts`, `lib/driver/README.md`, `domains/shared/skills/drive/SKILL.md`, `docs/orchestration.md`) deliver Design §7 by consuming the classifier TASK-798 created, unchanged, and adding only the Drive-only `tool_call` composition, refusal text, and snapshot creation and cleanup; Design §7 is delivered across classifier, Drive-only Pi composition, all-backend snapshot creation, event/note contracts, cleanup, and documented residuals; snapshot creation never applies stash state to the worktree.
- [x] #4 Ratified ground binds exactly: “INV-006 - Task state and the worktree change only through validated paths. Worker-supplied task fields are validated before they reach task files, and a worker cannot discard uncommitted work left by a previous attempt.” “Ranking. INV-006 wins over worker autonomy: a guard that refuses a destructive git command is preferred to a prompt rule the worker may ignore.” Human-reviewed D-020 stands: every backend snapshots the dirty worktree before every spawn. Any collision, including inability of pinned Pi to block `tool_call`, stops for recorded disposition under the deviation protocol rather than silently narrowing coverage.
- [x] #5 No `lib/durable-runtime/` change; no `drive-envelope` or `execution-liveness` work; no suppression, threshold, baseline, ignore-pattern, or configuration change to clear a finding; no test expectation change except where it pinned the defect being removed, citing the criterion (AC-020). Command substitution, aliases, and redirect-overwrite remain documented classifier residuals covered by snapshots, not hidden as complete classification.
- [x] #6 D-028: this slice is implemented in a single Drive run on the `cosmonauts-subagent` inline backend from a print-mode cosmo session.
- [x] #7 D-030: implementation notes contain separate red/green evidence rows for B-009 and the owned snapshot clauses of B-011; for each owned behavior portion, one failing run before the change and one passing run after it are recorded with test name and commit, the failing row includes a one-line failure, and the passing row records the successful result.
<!-- AC:END -->

## Implementation Notes

### Coordinator note before attempt 1 (2026-09-29, observed while snapshotting TASK-796's dirty tree)

Design §7 suggests `snapshotWorktree` uses `git stash create` with `git add -A --intent-to-add` for untracked files. That combination fails: with an intent-to-add entry in the index, `git stash create` exits 1 with `error: Entry '<file>' not uptodate. Cannot merge. / Cannot save the current worktree state`. A working alternative that captures tracked and untracked state without touching the real index or worktree: a temporary index (`GIT_INDEX_FILE=<tmp> git read-tree HEAD && GIT_INDEX_FILE=<tmp> git add -A -- . ':(exclude)missions' ':(exclude)memory'`), then `git write-tree`, `git commit-tree <tree> -p HEAD`, and `git update-ref refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n> <sha>`. Verified on this tree (10 modified + 1 untracked captured; `git status` unchanged afterwards). Derived detail; choose either mechanism that meets B-011's outcome, and record the one you use.

D-030 B-009 RED | commit 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb | `bun run test -- tests/agents/session-assembly.test.ts -t 'blocks destructive Bash only'` | fails: expected [] to have length 1 but got 0 (Drive-only extension absent).

D-030 B-011 snapshot clauses RED (legacy) | commit 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb | `bun run test -- tests/driver/run-one-task.test.ts -t 'snapshots tracked and untracked bytes'` | fails: spawn_started has no worktreeSnapshot for dirty tree (blocked and success cases).

D-030 B-011 snapshot clauses RED (graph/external backend) | commit 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb | `bun run test -- tests/driver/drive-scheduler-backend.test.ts -t 'snapshots dirty tracked and untracked bytes'` | fails: spawn_started missing worktreeSnapshot on both blocked and success paths.

D-030 B-009 GREEN | source base commit 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb (Drive owns resulting commit) | `bun run test -- tests/agents/session-assembly.test.ts` | passed 35 tests; mutation replacing destructive predicate with unconditional skip made 'blocks destructive Bash only for a Drive worker while preserving ordinary Git' fail (expected block true, got undefined), restored and verified. D-030 B-011 snapshot clauses GREEN (legacy and graph/external backend) | source base commit 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb (Drive owns resulting commit) | `bun run test -- tests/driver/run-one-task.test.ts -t 'snapshots tracked and untracked bytes'` passed 2 tests; `bun run test -- tests/driver/drive-scheduler-backend.test.ts -t 'snapshots dirty tracked and untracked bytes'` passed 2 tests; mutated dirty check to skip snapshot, legacy test failed missing worktreeSnapshot, restored. Temporary index used because stash create with intent-to-add fails; excludes only Drive run-artifact directories (`missions/sessions`, `missions/archive/sessions`) to avoid snapshotting compiled runner binaries in repositories without normal ignore patterns. Two older test expectations updated for AC-014/D-020's required append-only snapshot note.

Changed-scope audit with literal task-start base 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb returned unbound (`execution-not-consented`, provider fallow); audit evidence unavailable, not clean.

Final required postflight: `bun run test` 291 files/4058 tests passed; `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` passed. Previously failing full suite traced to untracked compiled runner binaries under `missions/sessions/` in synthetic non-ignored repos; excluding only run artifacts made cross-plan and parity detached suites pass. All task code is left unstaged for Drive-owned commit.

Final recheck after latest-ref tie-break and diagnostic cleanup: `bun run test` 291/291 files, 4058/4058 tests passed; `bun run lint`, `bun run typecheck`, `bun run check:reachability`, `bun run check:suppressions -- --base main` all passed. Repeated changed-scope audit at literal base 69a8c9df06291f31ca7a5b576c41644ae8bd8bbb: unbound (`execution-not-consented`), no clean audit claim.