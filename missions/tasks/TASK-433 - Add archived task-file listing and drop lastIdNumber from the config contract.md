---
id: TASK-433
title: Add archived task-file listing and drop lastIdNumber from the config contract
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:task-id-system'
dependencies: []
createdAt: '2026-06-30T17:36:17.602Z'
updatedAt: '2026-06-30T18:01:33.093Z'
---

## Description

Add listArchivedTaskFiles(projectRoot) to lib/tasks/file-system.ts mirroring listTaskFiles (sorted .md only; [] when the dir is missing); share one internal listMarkdownFiles helper between active+archived to avoid divergent IO. Remove lastIdNumber from ForgeTasksConfig (lib/tasks/task-types.ts); strip legacy lastIdNumber on loadConfig and before saveConfig so legacy files are tolerated and never re-emit it. Owns B-008 — marker #B-008.

<!-- AC:BEGIN -->
- [x] #1 B-008: listArchivedTaskFiles returns sorted .md filenames from missions/archive/tasks/ and [] when that directory is absent
- [x] #2 Active and archived listing share one missing-dir/filter/sort helper (no divergent copies)
- [x] #3 B-008: ForgeTasksConfig no longer declares lastIdNumber; loadConfig/saveConfig strip it so a legacy file is tolerated without error and never re-emitted
- [x] #4 file-system tests cover archived listing and legacy stripping, carry the #B-008 marker, and pass
<!-- AC:END -->
