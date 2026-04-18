---
id: TASK-056
title: Move skills to domain directories
status: Done
assignee: worker
priority: medium
labels:
  - backend
  - 'plan:domain-config'
dependencies:
  - TASK-052
createdAt: '2026-03-09T16:02:23.386Z'
updatedAt: '2026-03-09T14:20:00.000Z'
---

## Description

Relocate all skill directories from the centralized `skills/` directory to domain-based layout.

**File moves:**
- `skills/domains/archive/` → `domains/shared/skills/archive/`
- `skills/domains/plan/` → `domains/shared/skills/plan/`
- `skills/domains/roadmap/` → `domains/shared/skills/roadmap/`
- `skills/domains/task/` → `domains/shared/skills/task/`
- `skills/languages/typescript/` → `domains/coding/skills/languages/typescript/`

**Also:**
- Delete old `skills/` directory
- Update `package.json` `pi.skills` to `["./domains/shared/skills", "./domains/coding/skills"]`

**Reference:** Plan section "Skill resolution" and package.json updates.

<!-- AC:BEGIN -->
- [x] #1 All skill directories exist at their new domain paths with content preserved
- [x] #2 Old skills/ directory is deleted
- [x] #3 package.json pi.skills array points to domain skill directories
- [x] #4 Pi framework skill discovery works with the new paths
<!-- AC:END -->

## Implementation Notes

Moved all skill files from centralized `skills/` to domain directories:
- `skills/domains/{archive,plan,roadmap,task}/` → `domains/shared/skills/{archive,plan,roadmap,task}/`
- `skills/languages/typescript/` → `domains/coding/skills/languages/typescript/`

Deleted old `skills/` directory and `.gitkeep` placeholders. Updated `package.json` `pi.skills` to point to `["./domains/shared/skills", "./domains/coding/skills"]`. All 607 tests pass. Content verified identical via `diff -r`.
