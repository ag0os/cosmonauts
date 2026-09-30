---
type: decision
title: >-
  Worktree snapshot refs protect the dirty delta at spawn and are deleted only
  when that delta is still in the final tree
description: >-
  Before every spawn Drive commits the dirty worktree to a run-scoped ref; on
  Done the ref is deleted only if every path in the snapshot's delta from its
  parent is byte-identical (with mode) in the final tree, the task's own file
  exempt.
resource: >-
  knowledge/driver-hardening/decision-worktree-snapshot-refs-protect-the-dirty-delta-at-spawn-and-are-deleted-only-when-that-delta-is-still-in-the-final-tree-eb1ecae1b4cf.md
tags:
  - D-020
  - D-034
  - D-036
  - INV-006
  - drive
  - snapshot
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/plan.md
date: '2026-09-30T00:00:00.000Z'
---
# Worktree snapshot refs protect the dirty delta at spawn and are deleted only when that delta is still in the final tree

D-020: before every dirty-worktree spawn, on every backend and both Drive paths, Drive writes tracked modifications and non-ignored untracked files to a commit under refs/cosmonauts/drive/<runId>/<taskId>/attempt-<n> via a temporary index (git stash create cannot capture intent-to-add entries, and exclude pathspecs fail on gitignored directories; a temporary core.excludesFile skips the session directories instead). Blocked and aborted attempts keep their refs.

D-034 amended "delete on Done": an external worker can discard a prior attempt's work, report success, and Drive would delete the only copy. D-036 fixed what "contained" means: the whole snapshot tree always differs from the final tree because the worker legitimately edits files, so every real Done task retained its ref forever; the protected set is the snapshot's delta from its parent commit (diff-tree ref^ ref). D-035 defines the final tree per path: the Drive commit for committable paths, the working tree for paths the commit policy leaves uncommitted (missions/**, memory/**, lock files) and under no-commit; the task's own file, at snapshot time and at cleanup, is exempt because Drive rewrites it and note preservation guards its content. Mode is compared with the object id.

Consequences: a retry attempt that edits attempt 1's dirty files further retains its ref, which the check cannot tell from a discard; retention is cheap and named in the run's terminal record. Git text normalization inside the snapshot is a recorded residual: the ref holds what a commit of that worktree would hold.
