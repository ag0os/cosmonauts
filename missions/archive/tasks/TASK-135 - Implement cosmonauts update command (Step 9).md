---
id: TASK-135
title: Implement cosmonauts update command (Step 9)
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:framework-extraction'
dependencies:
  - TASK-130
createdAt: '2026-03-30T18:20:25.642Z'
updatedAt: '2026-03-30T18:33:43.860Z'
---

## Description

Create `cli/update/subcommand.ts` implementing `cosmonauts update [name] [--all] [--local]`. The command reads `.cosmonauts-meta.json` from the install directory and applies the appropriate update strategy per source type. Register the subcommand in `cli/main.ts`.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Update strategy per source type:**
- `catalog` → re-copy from `bundled/<catalogName>/` (uses catalog + installer)
- `git` → `git -C <installPath> pull` (or re-clone if needed)
- `link` → skip with message "Symlinked package — already live, no update needed"
- `local` → warn: "Local package source unknown; re-run `cosmonauts install <path>` to update"
- missing metadata → warn: "No metadata found for <name>; cannot determine update strategy"

**Interface:**
```typescript
interface UpdateOptions {
  target?: string;  // specific package name
  all?: boolean;
  local?: boolean;  // scope: project-local only
}
```

**Work:**
1. Create `cli/update/subcommand.ts` with the update logic
2. Register it in `cli/main.ts` alongside install/uninstall
3. Create `tests/cli/update/subcommand.test.ts` with tests covering each source type

<!-- AC:BEGIN -->
- [ ] #1 cosmonauts update coding re-copies from bundled/coding/ when meta source is 'catalog'
- [ ] #2 cosmonauts update --all iterates all installed packages and applies the correct strategy to each
- [ ] #3 Symlinked packages produce a skip message, not an error
- [ ] #4 Local packages produce a warning suggesting re-install
- [ ] #5 Packages with missing .cosmonauts-meta.json produce a clear warning
- [ ] #6 cosmonauts update is registered and visible in CLI help output
- [ ] #7 tests/cli/update/subcommand.test.ts covers all source type branches and passes
<!-- AC:END -->

## Implementation Notes

All 7 ACs confirmed. cli/update/subcommand.ts created with all source-type branches (catalog: uninstall+reinstall, git: pull, link: skip msg, local: warn, missing: warn). Registered in cli/main.ts. 14 tests in tests/cli/update/subcommand.test.ts all pass. Full suite 1109/1109 green. Coordinator closing as Done.
