---
id: TASK-447
title: Add read-only artifact loading and escaped viewer rendering foundation
status: To Do
priority: medium
labels:
  - frontend
  - backend
  - testing
  - 'plan:code-structure-map'
dependencies:
  - TASK-446
createdAt: '2026-07-03T14:13:43.273Z'
updatedAt: '2026-07-03T14:13:43.273Z'
---

## Description

Implementation order step 7, viewer foundation. Behavior ownership: owns B-016 only. Add the non-mutating task listing seam and dependency-free artifact-viewer loading/rendering foundation that later HTTP routes will use for plans, reviews, task status, and architecture markdown. Viewer work must not begin until the memory-half checkpoint is complete. Planned-behavior tests must carry `@cosmo-behavior plan:code-structure-map#B-016`.

<!-- AC:BEGIN -->
- [ ] #1 `TaskManager.listTasksReadOnly()` mirrors existing task-list filter and return shapes while reading existing task files without scaffolding task config or missing directories.
- [ ] #2 Artifact-viewer loaders validate plan slugs and architecture resources before building artifact paths and use read-only task listing for task status.
- [ ] #3 B-016: markdown from plans, reviews, map indexes, and module shards is escaped before HTML rendering so literal HTML or script-like text cannot inject executable markup.
- [ ] #4 The renderer remains dependency-free for W1, supporting only the planned minimal markdown subset with escaped/preformatted fallback for unsupported content.
- [ ] #5 Viewer foundation modules respect dependency direction: presentation code may import architecture-map/plans/read-only tasks, but none of those modules import artifact-viewer.
- [ ] #6 Tests for B-016 carry the required `@cosmo-behavior plan:code-structure-map#B-016` marker and prove read-only listing does not create task scaffolding.
- [ ] #7 `lib/artifact-viewer/index.ts` is registered in `fallow.toml`'s public entry list as a stable public entry point.
<!-- AC:END -->
