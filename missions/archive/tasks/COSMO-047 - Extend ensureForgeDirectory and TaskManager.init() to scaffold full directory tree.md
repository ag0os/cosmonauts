---
id: COSMO-047
title: >-
  Extend ensureForgeDirectory and TaskManager.init() to scaffold full directory
  tree
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:local-vs-shared'
dependencies:
  - COSMO-046
createdAt: '2026-03-06T14:49:04.587Z'
updatedAt: '2026-03-06T14:58:33.259Z'
---

## Description

Extend `ensureForgeDirectory` in `lib/tasks/file-system.ts` to create the complete local directory scaffold beyond just `missions/tasks/`. Also update `TaskManager.init()` and `cli/tasks/commands/init.ts` messaging to reflect the full scaffold.

The full directory tree to create:
```
missions/
  tasks/
    config.json
  plans/
  archive/
    tasks/
    plans/
  reviews/
memory/
```

Files to change:
- `lib/tasks/file-system.ts` — extend `ensureForgeDirectory` to create all subdirectories (`plans/`, `archive/tasks/`, `archive/plans/`, `reviews/`) and `memory/`
- `lib/tasks/task-manager.ts` — no functional change needed if `ensureForgeDirectory` handles everything, but verify `init()` calls it
- `cli/tasks/commands/init.ts` — update console output messaging to list all created directories

Key constraints:
- Must be idempotent — safe to call on an existing project
- Must NOT overwrite `missions/tasks/config.json` if it already exists (existing `loadConfig` + merge pattern already handles this)
- Use `mkdir({ recursive: true })` for all directories

<!-- AC:BEGIN -->
- [x] #1 Running `ensureForgeDirectory` creates `missions/plans/`, `missions/archive/tasks/`, `missions/archive/plans/`, `missions/reviews/`, and `memory/` in addition to existing `missions/tasks/`
- [x] #2 Running `ensureForgeDirectory` on an already-scaffolded project succeeds without errors (idempotent)
- [x] #3 Existing `missions/tasks/config.json` is not overwritten or lost when `ensureForgeDirectory` runs
- [x] #4 CLI `cosmonauts-tasks init` output lists all created directories, not just `missions/tasks/`
- [x] #5 All existing tests in `tests/tasks/file-system.test.ts` still pass (backward compatible)
<!-- AC:END -->

## Implementation Notes

Changed 2 files:\n\n- `lib/tasks/file-system.ts`: Extended `ensureForgeDirectory` to create all 6 directories using `Promise.all` with `mkdir({ recursive: true })`.\n- `cli/tasks/commands/init.ts`: Updated output to list all 6 created directories.\n\nAll 37 existing tests pass.\n\n[Coordinator note - attempt 1]: Worker completed implementation but did not check off ACs via task_edit. Resetting for verification pass.\n\nVerification pass: All 5 ACs confirmed satisfied. `ensureForgeDirectory` in `lib/tasks/file-system.ts` creates all 6 directories via `Promise.all` with `mkdir({ recursive: true })`. CLI init output in `cli/tasks/commands/init.ts` lists all directories. All 37 existing tests pass.
