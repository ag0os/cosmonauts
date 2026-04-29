---
id: TASK-243
title: >-
  W4-03: Refactor lib/packages/store.ts listInstalledPackages into store helper
  functions
status: Done
priority: medium
labels:
  - 'wave:4'
  - 'area:validation'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T14:00:41.986Z'
updatedAt: '2026-04-29T16:27:14.054Z'
---

## Description

Refactor the `listInstalledPackages(scope, projectRoot)` function at `lib/packages/store.ts:64` into named store helper functions, removing the complexity suppression.

**Suppression:** `lib/packages/store.ts:64`, `listInstalledPackages(scope, projectRoot)`.

**Current responsibilities:** resolves store root, returns empty for missing store, reads store entries, skips stat/read failures and non-directories, descends scoped `@scope/name` directories, reads/validates manifests, skips invalid manifests, and returns `InstalledPackage` records with install path/scope/birthtime.

**Target pattern:** store helpers:
- `readStoreEntries(storeRoot: string): Promise<string[]>`
- `collectCandidatePackageDirs(storeRoot: string, entries: readonly string[]): Promise<Array<{ path: string; birthtime: Date }>>`
- `collectScopedPackageDirs(scopeDir: string): Promise<Array<{ path: string; birthtime: Date }>>`
- `readInstalledPackage(installPath: string, birthtime: Date, scope: PackageScope): Promise<InstalledPackage | undefined>`

**Coverage status:** `add-characterization-tests` — existing `tests/packages/store.test.ts:94` covers missing/empty store, valid packages, installPath/scope/installedAt, skipped invalid entries, and non-directory entries; add: scoped package discovery for `@org/pkg`, unreadable scoped directory/stat failure tolerance if feasible, and invalid scoped child manifest skip.

**TDD note:** yes for candidate collection/read helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/packages/store.ts:64`.
- Commit the change as a single commit: `W4-03: Refactor lib/packages/store.ts listInstalledPackages`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 4 / W4-03

<!-- AC:BEGIN -->
- [ ] #1 Added scoped package characterization tests are green before refactor.
- [ ] #2 listInstalledPackages delegates candidate collection and manifest reading.
- [ ] #3 Suppression at lib/packages/store.ts:64 is removed.
- [ ] #4 Missing/corrupt manifests continue to be skipped without throwing.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
