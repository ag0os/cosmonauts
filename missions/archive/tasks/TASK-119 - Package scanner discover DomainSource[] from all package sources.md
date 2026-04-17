---
id: TASK-119
title: 'Package scanner: discover DomainSource[] from all package sources'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-118
createdAt: '2026-03-28T20:35:56.096Z'
updatedAt: '2026-03-28T20:46:24.340Z'
---

## Description

Create `lib/packages/scanner.ts` implementing `scanDomainSources({ builtinDomainsDir, projectRoot, pluginDirs? })`. Scans built-in directory, global store packages, local store packages, and any plugin dirs to produce an ordered `DomainSource[]` with correct precedence values. Add tests in `tests/packages/scanner.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 scanDomainSources() returns DomainSource[] ordered by precedence: built-in (0) → global packages (1) → local packages (2) → plugin-dirs (3)
- [ ] #2 Each DomainSource carries the correct domainsDir (pointing into the package root), origin label, and precedence
- [ ] #3 pluginDirs parameter is optional; omitting it returns only built-in + store sources
- [ ] #4 Packages with no declared domains directory are skipped without error
- [ ] #5 Tests cover: no packages installed, global-only, local-only, both scopes, and plugin-dir inclusion
<!-- AC:END -->

## Implementation Notes

Implemented scanDomainSources() in lib/packages/scanner.ts. Renamed existing DomainSource (manifest domain entry with name+path) to PackageDomain to free the name for the scanner output type. New DomainSource = { domainsDir, origin, precedence }. Tests use vi.mock to control listInstalledPackages output deterministically. All 14 tests pass, typecheck clean."
