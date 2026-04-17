---
id: TASK-129
title: Update catalog source paths to bundled/ (Step 3)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies:
  - TASK-127
  - TASK-128
createdAt: '2026-03-30T18:19:22.606Z'
updatedAt: '2026-03-30T18:30:35.570Z'
---

## Description

Update `lib/packages/catalog.ts` so that catalog entries for `coding` and `coding-minimal` resolve to paths under `bundled/` instead of `domains/`. Ensure path resolution is relative to the framework root (via `import.meta.url`), not the caller's cwd.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. In `lib/packages/catalog.ts`, change the source path for the `coding` entry from `./domains/coding` (or equivalent) to `./bundled/coding`
2. Add or update a `coding-minimal` entry pointing to `./bundled/coding-minimal`
3. Verify that `resolveCatalogEntry()` resolves these relative paths using `import.meta.url` (framework root), not `process.cwd()`
4. If any callers of the catalog resolve the returned path differently, update them to resolve relative to framework root

<!-- AC:BEGIN -->
- [ ] #1 lib/packages/catalog.ts has a 'coding' entry whose source path resolves to bundled/coding/
- [ ] #2 lib/packages/catalog.ts has a 'coding-minimal' entry whose source path resolves to bundled/coding-minimal/
- [ ] #3 resolveCatalogEntry() resolves paths relative to framework root (import.meta.url), not process.cwd()
- [ ] #4 Existing catalog tests in tests/packages/catalog.test.ts pass or are updated to expect bundled/ paths
<!-- AC:END -->

## Implementation Notes

All 4 ACs confirmed by two independent workers. catalog.ts has 'coding' → ./bundled/coding and 'coding-minimal' → ./bundled/coding-minimal entries. Path resolution via import.meta.url in cli/packages/subcommand.ts resolveCatalogSource(). All 9 catalog tests pass. Coordinator closing as Done.
