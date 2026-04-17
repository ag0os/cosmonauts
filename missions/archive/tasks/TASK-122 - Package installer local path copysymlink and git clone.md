---
id: TASK-122
title: 'Package installer: local path copy/symlink and git clone'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-114
  - TASK-118
createdAt: '2026-03-28T20:36:18.216Z'
updatedAt: '2026-03-28T20:45:32.047Z'
---

## Description

Create `lib/packages/installer.ts` implementing `installPackage(options)` and `uninstallPackage(name, scope, projectRoot)`. Supports: local path copy (default), local path symlink (`--link`), and git repo clone (HTTPS public repos, shallow clone). Validates manifest before placement, detects domain conflicts using `DomainMergeConflict`. Add tests in `tests/packages/installer.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 installPackage() with a local path copies the package directory into the correct store location
- [ ] #2 installPackage() with link: true creates a symlink instead of copying
- [ ] #3 installPackage() with a github: or https:// URL performs a shallow git clone then copies to the store
- [ ] #4 InstallResult includes manifest, installedTo path, and any DomainMergeResult entries
- [ ] #5 uninstallPackage() removes the package directory from the store and returns true; returns false if not found
- [ ] #6 Validation fails fast with a clear error if cosmonauts.json is missing or a declared domain directory is absent
- [ ] #7 Tests cover local copy, symlink, successful uninstall, uninstall of non-existent package, and invalid source
<!-- AC:END -->

## Implementation Notes

Created lib/packages/installer.ts with installPackage(options) and uninstallPackage(name, scope, projectRoot). DomainMergeResult is a lightweight type (domainId + existingPackage) — full LoadedDomain construction skipped as installer operates at manifest level. Git clone uses node:child_process spawn. All 12 new tests pass; 1015 total suite tests green.
