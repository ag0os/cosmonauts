---
id: TASK-134
title: Remove domains/coding/ and update path references (Step 8)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies:
  - TASK-132
  - TASK-133
createdAt: '2026-03-30T18:20:12.829Z'
updatedAt: '2026-03-30T18:48:06.815Z'
---

## Description

Delete `domains/coding/` from the worktree. The canonical location is now `bundled/coding/coding/`. Update any tests or code that referenced the old path.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Prerequisites:** Dev-mode auto-detection (TASK-132) and first-run detection (TASK-133) must be complete so the framework works without `domains/coding/`.

**Work:**
1. Delete `domains/coding/` in the worktree
2. Update `tests/domains/coding-agents.test.ts` — change any path references from `domains/coding/` to `bundled/coding/coding/`
3. Search for any other hardcoded `domains/coding` path references in source or test files and update them
4. Verify that `domains/` now contains only `shared/`
5. Run test suite to confirm no regressions from the removal

## Implementation Plan

- [x] #1 domains/ directory contains only shared/ — coding/ is gone
- [x] #2 No source or test file references domains/coding/ as a hardcoded path
- [x] #3 tests/domains/coding-agents.test.ts references bundled/coding/coding/ and passes
- [x] #4 Full test suite passes after the deletion

<!-- AC:BEGIN -->
- [ ] #1 domains/ directory contains only shared/ — coding/ is gone
- [ ] #2 No source or test file references domains/coding/ as a hardcoded path
- [ ] #3 tests/domains/coding-agents.test.ts references bundled/coding/coding/ and passes
- [ ] #4 Full test suite passes after the deletion
<!-- AC:END -->

## Implementation Notes

domains/coding/ was already deleted in a prior partial run (commit 974ad36) which also updated coding-agents.test.ts. That commit left three test files broken because their domain resolvers were still loading from domains/ only (which no longer has coding/). Fixed by updating agent-spawner.spawn.test.ts, agent-spawner.completion-loop.test.ts, and extensions/orchestration.test.ts to use loadDomainsFromSources with both domains/ (shared) and bundled/coding/ (coding domain). Also updated test description strings in loader.test.ts to reference bundled/coding/coding/ paths. All 1125 tests pass.
