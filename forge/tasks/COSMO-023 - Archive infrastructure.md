---
id: COSMO-023
title: Archive infrastructure
status: To Do
priority: high
labels:
  - forge
  - plan:forge-lifecycle
dependencies:
  - COSMO-020
  - COSMO-022
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Build the archive system. Archiving is a mechanical operation that moves completed plans and their associated tasks from active directories into `forge/archive/`, preserving original file structure.

The `plan_archive` tool (registered in the plans Pi extension) takes a plan slug, verifies the plan exists, moves the plan directory to `forge/archive/plans/<slug>/`, finds all tasks with the `plan:<slug>` label, and moves them to `forge/archive/tasks/`. Also ensures the `memory/` directory exists at project root (as a convention — distillation writes there later).

Archive operations should be in `lib/plans/` (as methods on PlanManager or a separate ArchiveManager). The file moves use `rename` when possible (same filesystem) with fallback to copy+delete.

<!-- AC:BEGIN -->
- [ ] #1 `plan_archive` tool moves plan directory from `forge/plans/<slug>/` to `forge/archive/plans/<slug>/`
- [ ] #2 All tasks with `plan:<slug>` label are moved from `forge/tasks/` to `forge/archive/tasks/`
- [ ] #3 Archive preserves original file structure and content (no modifications to files)
- [ ] #4 Archive creates `forge/archive/plans/` and `forge/archive/tasks/` directories as needed
- [ ] #5 Archive creates `memory/` directory at project root if it doesn't exist
- [ ] #6 Archive rejects if plan doesn't exist or if plan has tasks still in non-Done status (safety check)
- [ ] #7 Tests cover full archive flow, directory creation, task association, and safety check rejection
<!-- AC:END -->
