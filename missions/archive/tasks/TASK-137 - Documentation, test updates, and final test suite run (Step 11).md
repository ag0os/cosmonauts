---
id: TASK-137
title: 'Documentation, test updates, and final test suite run (Step 11)'
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - backend
  - 'plan:framework-extraction'
dependencies:
  - TASK-134
  - TASK-135
  - TASK-136
createdAt: '2026-03-30T18:20:43.647Z'
updatedAt: '2026-03-30T18:49:19.724Z'
---

## Description

Update documentation to reflect the new directory structure and add any missing tests. Run the full test suite to confirm everything is green.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
1. **AGENTS.md** — Update the "Key directories" section to reflect: `bundled/` is the new home for installable domain packages; `domains/` now contains only `shared/`
2. **tests/packages/catalog.test.ts** — Add or update tests that verify catalog entries resolve to `bundled/` paths (not `domains/`)
3. **tests/runtime.test.ts** — Verify the no-domain graceful behavior test added in TASK-131 is present and passing
4. **tests/cli/update/subcommand.test.ts** — Verify the update command tests from TASK-135 are complete
5. Run the full test suite (`bun test` or equivalent) and confirm zero failures
6. Confirm `npm pack --dry-run` output looks correct (all required files present, no junk)

<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md 'Key directories' section documents bundled/ and reflects that domains/ contains only shared/
- [ ] #2 tests/packages/catalog.test.ts verifies catalog resolves to bundled/ paths
- [ ] #3 Full test suite passes with zero failures
- [ ] #4 npm pack --dry-run confirms correct file inclusion
<!-- AC:END -->

## Implementation Notes

All 4 ACs confirmed. AGENTS.md Key Directories updated. catalog.test.ts already verified bundled/ paths. 1125 tests / 60 files all pass (via `bun run test` / vitest — NOT `bun test`). npm pack --dry-run clean: bundled/coding/, bundled/coding-minimal/, domains/shared/ present; no stale domains/coding/ in tarball. Coordinator closing as Done.
