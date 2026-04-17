---
id: TASK-127
title: Create bundled/coding/ package (Step 1)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies: []
createdAt: '2026-03-30T18:19:03.142Z'
updatedAt: '2026-03-30T18:23:07.003Z'
---

## Description

Copy the full coding domain from `domains/coding/` into `bundled/coding/coding/` and create the package manifest.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. Copy `domains/coding/` → `bundled/coding/coding/` (all 14 agents, 14 prompts, 4 capabilities, 8 skills, workflows.ts, domain.ts)
2. Create `bundled/coding/cosmonauts.json`:
```json
{
  "name": "coding",
  "version": "0.1.0",
  "description": "Full-featured coding domain with agents, tools, and skills for software development",
  "domains": [{ "name": "coding", "path": "coding" }]
}
```
3. Ensure `.gitignore` does NOT ignore the `bundled/` directory.

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/cosmonauts.json exists with correct name, version, and domains fields
- [ ] #2 bundled/coding/coding/ contains all 14 agents, 14 prompts, 4 capabilities, 8 skills, workflows.ts, and domain.ts
- [ ] #3 The package manifest passes the existing manifest validator (ManifestValidator or equivalent) without errors
- [ ] #4 bundled/ is not listed in .gitignore
<!-- AC:END -->

## Implementation Notes

Copied domains/coding/ → bundled/coding/coding/ (14 agents, 14 prompts, 4 capabilities, 8 skills, workflows.ts, domain.ts). Created bundled/coding/cosmonauts.json with correct fields. Confirmed .gitignore has no bundled/ entry. Manifest validated via validateManifest() — passes clean. All 1081 existing tests pass.
