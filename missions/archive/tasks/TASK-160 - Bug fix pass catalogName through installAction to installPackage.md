---
id: TASK-160
title: 'Bug fix: pass catalogName through installAction to installPackage'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - api
  - 'plan:domain-eject-and-tiers'
dependencies: []
createdAt: '2026-04-10T02:16:10.830Z'
updatedAt: '2026-04-10T02:19:01.959Z'
---

## Description

Fix the `catalogName` pass-through bug in `cli/packages/subcommand.ts`.

**Current behavior:** `installAction` calls `resolveSource(arg)` which calls `resolveCatalogEntry` internally but discards the catalog name. The resolved source path is passed to `installPackage` without `catalogName`, so catalog installs get `source: "local"` metadata instead of `source: "catalog"` with the catalog name. This breaks the `update` command for catalog packages.

**Fix:** In `installAction`, replace the `resolveSource(arg)` call with an inline catalog check:
```typescript
const entry = resolveCatalogEntry(arg);
const source = entry ? resolveCatalogSource(entry.source) : arg;
const catalogName = entry?.name;
```
Then pass `catalogName` to `installPackage`:
```typescript
result = await installPackage({
  source,
  scope,
  projectRoot: cwd,
  link: options.link,
  branch: options.branch,
  catalogName,   // ← new
});
```

The `resolveSource` helper function remains exported unchanged (used by other callers, backward compat).

Add a test to `tests/cli/packages/subcommand.test.ts` verifying that when `resolveCatalogEntry` returns a catalog entry, `installPackage` is called with `catalogName` set to the entry's name (e.g. `"coding"`).

<!-- AC:BEGIN -->
- [ ] #1 installAction passes catalogName to installPackage when the install argument resolves to a catalog entry
- [ ] #2 When the install argument is a non-catalog source (URL or local path), catalogName is not passed (or is undefined)
- [ ] #3 The resolveSource helper function remains exported and its behavior is unchanged
- [ ] #4 New test in tests/cli/packages/subcommand.test.ts verifies the catalogName passthrough
<!-- AC:END -->

## Implementation Notes

Replaced `resolveSource(arg)` in `installAction` with an inline catalog check that captures `entry?.name` as `catalogName` and passes it to `installPackage`. The `resolveSource` export is unchanged. Added two new tests: one asserting `catalogName` is set for catalog entries, one asserting it is `undefined` for non-catalog sources.
