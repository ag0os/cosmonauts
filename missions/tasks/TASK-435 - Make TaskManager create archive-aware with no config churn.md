---
id: TASK-435
title: Make TaskManager create archive-aware with no config churn
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:task-id-system'
dependencies:
  - TASK-432
  - TASK-433
createdAt: '2026-06-30T17:36:42.876Z'
updatedAt: '2026-06-30T18:08:48.584Z'
---

## Description

Rework TaskManager.createTask (lib/tasks/task-manager.ts) to allocate from active parsed IDs UNION archived filename IDs, computed INSIDE the create lock, with NO config write. Add ensureCreateConfig() that returns cached/sanitized config, loads+sanitizes config.json when present, uses an in-memory sanitized DEFAULT_CONFIG when absent, and never calls init() or saveConfig(). Sanitize init() returned+cached config so no stale counter persists. Keep list/search/get/update/delete active-only (use a create-only allocation helper; do not broaden loadAllTasks/findTaskFilenameById). Active IDs stay content-based; archived IDs come from filenames. Owns B-003,B-004,B-005,B-006,B-007,B-009 — markers #B-003..#B-007 and #B-009.

<!-- AC:BEGIN -->
- [x] #1 B-003: create allocates above an archived-only filename maximum even when the archived file body is missing/malformed (no archived ID reuse, no content parsing required)
- [x] #2 B-004: a missing/empty archive directory is treated as empty and creation still succeeds (empty project -> first configured ID)
- [x] #3 B-005: create leaves an existing config.json byte-unchanged and ignores any legacy lastIdNumber
- [x] #4 B-006: creating the first task when no config exists does not create config.json
- [x] #5 B-007: archived tasks influence allocation only — list/search/get/update/delete stay active-only and never return or edit archived files
- [x] #6 B-009: init() returns and caches config without lastIdNumber, and all allocation reads happen inside the create lock
<!-- AC:END -->
