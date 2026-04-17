---
id: TASK-136
title: Add files field to package.json for npm publish (Step 10)
status: Done
priority: medium
assignee: worker
labels:
  - devops
  - 'plan:framework-extraction'
dependencies:
  - TASK-127
  - TASK-128
createdAt: '2026-03-30T18:20:33.915Z'
updatedAt: '2026-03-30T18:30:23.331Z'
---

## Description

Add a `files` field to `package.json` so that `npm publish` (or `bun publish`) includes the `bundled/` directory and all other necessary runtime files. Verify the published file set is correct.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. Add `"files"` to `package.json`:
   ```json
   "files": ["bundled/", "domains/", "lib/", "cli/", "bin/"]
   ```
2. Verify with `npm pack --dry-run` (or `bun pack`) that `bundled/coding/` and `bundled/coding-minimal/` are included in the output file list
3. Confirm `domains/shared/` is included (it must ship with the framework)
4. Confirm `node_modules/`, test files, and mission files are NOT included

<!-- AC:BEGIN -->
- [ ] #1 package.json has a 'files' field listing bundled/, domains/, lib/, cli/, bin/
- [ ] #2 npm pack --dry-run output includes bundled/coding/cosmonauts.json and bundled/coding-minimal/cosmonauts.json
- [ ] #3 npm pack --dry-run output includes domains/shared/domain.ts
- [ ] #4 npm pack --dry-run output does NOT include node_modules/, tests/, or missions/
<!-- AC:END -->

## Implementation Notes

All 4 ACs confirmed satisfied by two independent workers. files field present in package.json (bundled/, domains/, lib/, cli/, bin/). npm pack --dry-run (217 files, 808.7 kB) confirmed: bundled/coding/cosmonauts.json ✓, bundled/coding-minimal/cosmonauts.json ✓, domains/shared/domain.ts ✓, node_modules/tests/missions/ excluded ✓. Coordinator closing as Done.
