---
id: TASK-114
title: >-
  Package types and manifest: define PackageManifest, DomainSource, and manifest
  I/O
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:package-system'
dependencies: []
createdAt: '2026-03-28T20:35:13.519Z'
updatedAt: '2026-03-28T20:39:51.572Z'
---

## Description

Create `lib/packages/types.ts` with `PackageManifest`, `InstalledPackage`, `PackageScope`, and `DomainSource` types. Create `lib/packages/manifest.ts` with `loadManifest()` and `validateManifest()`. Create `lib/packages/index.ts` barrel. Add tests in `tests/packages/manifest.test.ts`.

<!-- AC:BEGIN -->
- [ ] #1 PackageManifest, InstalledPackage, PackageScope, and DomainSource types are defined in lib/packages/types.ts
- [ ] #2 loadManifest() reads and parses cosmonauts.json from a directory path
- [ ] #3 validateManifest() returns typed errors for missing/invalid fields (name, version, description, domains)
- [ ] #4 Barrel at lib/packages/index.ts exports all public types and functions
- [ ] #5 Tests cover valid manifests, missing required fields, invalid name format, and empty domains array
<!-- AC:END -->

## Implementation Notes

Created lib/packages/types.ts (PackageManifest, InstalledPackage, PackageScope, DomainSource, ManifestValidationError, ManifestValidationResult), lib/packages/manifest.ts (loadManifest, validateManifest), lib/packages/index.ts barrel. Tests in tests/packages/manifest.test.ts cover 21 cases: valid manifests, missing fields, invalid name formats, empty domains, non-array domains, invalid domain entries. Package name validation uses regex supporting lowercase alphanumeric with hyphens/underscores and optional @scope/ prefix.
