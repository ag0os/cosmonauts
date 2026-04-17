---
id: TASK-128
title: Create bundled/coding-minimal/ package (Step 2)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies: []
createdAt: '2026-03-30T18:19:12.966Z'
updatedAt: '2026-03-30T18:26:59.657Z'
---

## Description

Build the minimal coding domain package — a lightweight subset of the full domain containing only the 6 core agents needed to get started.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. Create `bundled/coding-minimal/cosmonauts.json`:
```json
{
  "name": "coding-minimal",
  "version": "0.1.0",
  "description": "Minimal coding domain with essential agents for getting started",
  "domains": [{ "name": "coding", "path": "coding" }]
}
```
2. Copy 6 agents from `domains/coding/agents/`: cosmo, planner, task-manager, coordinator, worker, quality-manager
3. Copy their 6 matching persona prompts from `domains/coding/prompts/`
4. Copy all 4 capabilities from `domains/coding/capabilities/` (all are needed by these agents)
5. Copy 3 skills: `engineering-principles/`, `languages/`, `web-search/`
6. Create `bundled/coding-minimal/coding/domain.ts` (same shape as full domain.ts, adapted to the subset)
7. Create `bundled/coding-minimal/coding/workflows.ts` with 3 workflows: `plan-and-build`, `implement`, `verify`

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding-minimal/cosmonauts.json exists with correct fields; domain name is 'coding'
- [ ] #2 Exactly 6 agents present: cosmo, planner, task-manager, coordinator, worker, quality-manager
- [ ] #3 All 4 capabilities are present (architectural-design, coding-readonly, coding-readwrite, engineering-discipline)
- [ ] #4 Exactly 3 skills present: engineering-principles, languages, web-search
- [ ] #5 workflows.ts defines exactly 3 workflows: plan-and-build, implement, verify
- [ ] #6 Package passes the manifest validator without errors
<!-- AC:END -->

## Implementation Notes

Created bundled/coding-minimal/ package with all required files. Updated lib/packages/catalog.ts source from ./domains/coding-minimal to ./bundled/coding-minimal (consistent with existing bundled/coding/ pattern) and updated the catalog test accordingly. All 59 test files pass (1095 tests). Manifest validates cleanly.
