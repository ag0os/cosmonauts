---
id: TASK-147
title: 'Archive integration: move sessions directory during plan archive'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-143
  - TASK-146
createdAt: '2026-04-07T19:05:00.283Z'
updatedAt: '2026-04-07T19:26:09.950Z'
---

## Description

Extend `lib/plans/archive.ts` to include `missions/sessions/<slug>/` in archive operations, moving it to `missions/archive/sessions/<slug>/` when sessions exist.\n\n**Modified files:**\n- `lib/plans/archive.ts` — check for sessions dir, move it if present, add `archivedSessionsPath` to `ArchiveResult`\n\n**Behavior:**\n- If `missions/sessions/<slug>/` does not exist, archive proceeds normally (sessions are optional)\n- If it exists, move to `missions/archive/sessions/<slug>/`\n- Knowledge records in `memory/` are NOT moved — they are the durable layer\n\nImport `sessionsDirForPlan` from `lib/sessions/session-store.ts` for path resolution (per plan's dependency graph).

<!-- AC:BEGIN -->
- [ ] #1 ArchiveResult has an archivedSessionsPath?: string field
- [ ] #2 archivePlan moves missions/sessions/<slug>/ to missions/archive/sessions/<slug>/ when sessions exist (QC-006)
- [ ] #3 archivePlan succeeds normally when no sessions directory exists for the plan
- [ ] #4 Knowledge records in memory/ are not moved during archive
- [ ] #5 Existing archive tests continue to pass
<!-- AC:END -->

## Implementation Notes

Added `archivedSessionsPath?: string` to `ArchiveResult`. Archive step 6 uses `sessionsDirForPlan` to locate `missions/sessions/<slug>/`, checks existence via `stat`, then renames to `missions/archive/sessions/<slug>/` when present. `memory/` is untouched by design. Added 3 new tests covering sessions move, no-sessions no-op, and memory preservation. All 19 archive tests pass.
