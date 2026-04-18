---
id: TASK-057
title: Move extensions to domain directories and fix import paths
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-052
createdAt: '2026-03-09T16:02:35.633Z'
updatedAt: '2026-03-09T18:23:00.000Z'
---

## Description

Relocate all extension directories from `extensions/` to `domains/shared/extensions/` and fix all broken relative imports.

**File moves:**
- `extensions/tasks/` → `domains/shared/extensions/tasks/`
- `extensions/plans/` → `domains/shared/extensions/plans/`
- `extensions/orchestration/` → `domains/shared/extensions/orchestration/`
- `extensions/todo/` → `domains/shared/extensions/todo/`
- `extensions/init/` → `domains/shared/extensions/init/`

**Critical:** Every extension's `index.ts` uses relative imports like `../../lib/agents/index.ts`. Moving from `extensions/X/` to `domains/shared/extensions/X/` adds two directory levels, so all relative imports must be updated (e.g., `../../lib/` → `../../../../lib/`).

**Also:**
- Delete old `extensions/` directory
- Update `package.json` `pi.extensions` to `["./domains/shared/extensions"]`
- Update `EXTENSIONS_DIR` in `lib/orchestration/agent-spawner.ts` to point to new location
- Update `cli/main.ts` import of `buildInitPrompt` from init extension
- Update affected test files that import from extension paths

**Reference:** Plan risk #1 about import path cascading. Current imports visible in `extensions/orchestration/index.ts:1-14`.

<!-- AC:BEGIN -->
- [x] #1 All extension directories exist at domains/shared/extensions/ with functionality preserved
- [x] #2 Old extensions/ directory is deleted
- [x] #3 All relative imports within moved extension files resolve correctly
- [x] #4 package.json pi.extensions points to domain extension directory
- [x] #5 EXTENSIONS_DIR in agent-spawner.ts resolves to domains/shared/extensions
- [x] #6 cli/main.ts init extension import works from new path
- [x] #7 Extension-related tests pass
<!-- AC:END -->

## Implementation Notes

Attempt 1 failed: Worker could not spawn — prompt file not found at old path prompts/capabilities/tasks.md. TASK-055 relocated prompts to domains/shared/. Retrying.\n\nAttempt 2 failed: Same root cause as TASK-056. The pi framework agent spawner still resolves prompt slugs from the old prompts/ directory. The prompt loading infrastructure is broken after TASK-055's file relocation. This blocks ALL remaining tasks.

Attempt 3 (successful): Moved all 5 extension directories (tasks, plans, orchestration, todo, init) from `extensions/` to `domains/shared/extensions/`. Updated relative imports in moved files from `../../lib/` to `../../../../lib/` (two extra directory levels for `domains/shared/`). Updated external references in `cli/main.ts`, `lib/orchestration/agent-spawner.ts` (EXTENSIONS_DIR), and `package.json`. Updated 5 test files with new import paths. All 607 tests pass across 27 test suites.
