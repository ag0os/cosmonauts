---
id: TASK-124
title: 'CLI: cosmonauts install / uninstall / packages list subcommands'
status: Done
priority: medium
assignee: worker
labels:
  - cli
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-122
  - TASK-123
createdAt: '2026-03-28T20:36:33.287Z'
updatedAt: '2026-03-28T20:56:47.422Z'
---

## Description

Create `cli/packages/subcommand.ts` implementing the `install`, `uninstall`, and `packages list` commands. `install` resolves catalog short names first, then git URLs, then local paths. Supports `--link`, `--local`, `--branch`, and `--yes` (non-interactive merge) flags. Interactive merge prompt shown when domain conflicts exist and `--yes` is not set. Add tests in `tests/cli/packages/subcommand.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 cosmonauts install <name> resolves catalog short names via resolveCatalogEntry() before treating as path/URL
- [ ] #2 cosmonauts install --link ./path installs as symlink
- [ ] #3 cosmonauts install --local ./path installs to project-local scope
- [ ] #4 Domain conflict triggers interactive m/r/s/c prompt; --yes flag defaults to merge without prompting
- [ ] #5 cosmonauts uninstall <name> removes the package from global scope; --local targets project-local scope
- [ ] #6 cosmonauts packages (or cosmonauts packages list) prints installed packages with version, domains, and portable indicators
- [ ] #7 Tests cover successful install, uninstall, list output, --yes flag, and unknown package name error
<!-- AC:END -->

## Implementation Notes

Created cli/packages/subcommand.ts with createInstallProgram(), createUninstallProgram(), createPackagesProgram(). Extended lib/packages/installer.ts InstallOptions with branch?: string and updated shallowClone to accept branch. Registered all three subcommands in cli/main.ts. 25 tests pass covering all ACs. The conflict handling flow: installPackage runs first, then if domainMergeResults is non-empty and --yes is not set, an interactive m/r/s/c readline prompt is shown. merge=keep both, replace=uninstall conflicting packages, skip/cancel=uninstall the just-installed package. Catalog source paths (./bundled/coding) are resolved relative to the framework root via import.meta.url."
