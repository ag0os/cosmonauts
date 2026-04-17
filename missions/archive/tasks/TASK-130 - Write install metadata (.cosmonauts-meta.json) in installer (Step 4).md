---
id: TASK-130
title: Write install metadata (.cosmonauts-meta.json) in installer (Step 4)
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:framework-extraction'
dependencies: []
createdAt: '2026-03-30T18:19:32.607Z'
updatedAt: '2026-03-30T18:27:08.174Z'
---

## Description

Update `lib/packages/installer.ts` to write a `.cosmonauts-meta.json` file alongside every install. This metadata records how the package was installed so the future `update` command knows how to update it.

**Worktree:** All file operations in `/Users/cosmos/Projects/cosmonauts-extraction/`. Do NOT touch `/Users/cosmos/Projects/cosmonauts/`.

**Work:**
Modify each install path in `installer.ts` to write `.cosmonauts-meta.json` into the package's install directory after copying files:

- Catalog installs: `{ "source": "catalog", "catalogName": "<name>", "installedAt": "<ISO>" }`
- Git installs: `{ "source": "git", "url": "<url>", "branch": "<branch>", "installedAt": "<ISO>" }`
- Local copy installs: `{ "source": "local", "originalPath": "<path>", "installedAt": "<ISO>" }`
- Symlink installs: `{ "source": "link", "targetPath": "<path>", "installedAt": "<ISO>" }`

The file must be written as valid JSON. It lives at `<installDir>/.cosmonauts-meta.json`.

<!-- AC:BEGIN -->
- [ ] #1 After a catalog install, .cosmonauts-meta.json exists in the package dir with source='catalog' and catalogName set
- [ ] #2 After a git install, .cosmonauts-meta.json has source='git' with url and branch set
- [ ] #3 After a local install, .cosmonauts-meta.json has source='local' with originalPath set
- [ ] #4 After a link install, .cosmonauts-meta.json has source='link' with targetPath set
- [ ] #5 installedAt is a valid ISO 8601 timestamp in all cases
- [ ] #6 Existing installer tests still pass
<!-- AC:END -->

## Implementation Notes

Added `.cosmonauts-meta.json` writing to all four install paths in `installer.ts`. Added `catalogName?: string` to `InstallOptions` so the CLI can pass the catalog entry name when installing from the catalog. Extended `isGitSource` to also recognize `file://` URLs (valid git URL format, also enables local git repo testing without network). Added `InstallMeta` union type and `writeInstallMeta` helper. Wrote 9 new tests covering all four install types plus the ISO 8601 timestamp invariant. For git tests, fixtures use `git init -b main` and a `.gitkeep` placeholder so empty domain directories are tracked. All 1095 tests pass.
