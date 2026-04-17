---
id: TASK-118
title: 'Package store: on-disk store management for global and local scopes'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-114
createdAt: '2026-03-28T20:35:47.299Z'
updatedAt: '2026-03-28T20:41:26.655Z'
---

## Description

Create `lib/packages/store.ts`. Resolves `~/.cosmonauts/packages/` (global) and `<projectRoot>/.cosmonauts/packages/` (local) store paths. Implements: `listInstalledPackages(scope, projectRoot)`, `resolveStorePath(name, scope, projectRoot)`, `packageExists(name, scope, projectRoot)`. Add tests in `tests/packages/store.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 resolveStorePath() returns the correct absolute path for both global (~/.cosmonauts/packages/) and local (.cosmonauts/packages/) scopes
- [ ] #2 listInstalledPackages() reads manifests from all installed package directories in a scope and returns InstalledPackage[]
- [ ] #3 packageExists() returns true when a package directory with a valid cosmonauts.json is present
- [ ] #4 Store functions handle missing store directories gracefully (return empty list, not an error)
- [ ] #5 Tests cover global scope, local scope, empty store, and corrupt manifest handling
<!-- AC:END -->

## Implementation Notes

Implemented lib/packages/store.ts with resolveStorePath(), listInstalledPackages(), and packageExists(). Re-exported from lib/packages/index.ts. 22 tests pass. installedAt uses stat birthtime. listInstalledPackages skips non-directories, missing manifests, invalid JSON, and failed validation silently.
