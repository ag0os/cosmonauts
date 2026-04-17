---
id: TASK-123
title: 'Bundled domain catalog: getBundledCatalog() and resolveCatalogEntry()'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies:
  - TASK-114
createdAt: '2026-03-28T20:36:25.322Z'
updatedAt: '2026-03-28T20:46:40.481Z'
---

## Description

Create `lib/packages/catalog.ts` with `getBundledCatalog()` returning the static catalog of official bundled domains (coding, coding-minimal) and `resolveCatalogEntry(name)` for short-name lookup. Add `CatalogEntry` type. Add tests in `tests/packages/catalog.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 CatalogEntry type has name, description, and source fields
- [ ] #2 getBundledCatalog() returns at least the 'coding' and 'coding-minimal' entries
- [ ] #3 resolveCatalogEntry('coding') returns the correct entry
- [ ] #4 resolveCatalogEntry('unknown-name') returns undefined
- [ ] #5 Catalog source paths for bundled entries are relative to the framework root (e.g. './bundled/coding')
- [ ] #6 Tests cover successful lookup, unknown name, and catalog completeness
<!-- AC:END -->

## Implementation Notes

Created lib/packages/catalog.ts with CatalogEntry interface, getBundledCatalog() returning coding and coding-minimal entries with source paths relative to framework root (./bundled/*), and resolveCatalogEntry(name) for lookup. Exported all from lib/packages/index.ts. 9 tests added in tests/packages/catalog.test.ts covering all ACs. All ACs satisfied.
