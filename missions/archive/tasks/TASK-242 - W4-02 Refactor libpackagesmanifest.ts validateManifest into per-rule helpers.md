---
id: TASK-242
title: >-
  W4-02: Refactor lib/packages/manifest.ts validateManifest into per-rule
  helpers
status: Done
priority: medium
labels:
  - 'wave:4'
  - 'area:validation'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T14:00:29.795Z'
updatedAt: '2026-04-29T16:22:09.079Z'
---

## Description

Refactor the `validateManifest(raw)` function at `lib/packages/manifest.ts:60` into named per-field/rule helper functions, removing the complexity suppression.

**Suppression:** `lib/packages/manifest.ts:60`, `validateManifest(raw)`.

**Current responsibilities:** rejects non-object/array/null inputs with required missing fields, validates package name format, version/description strings, domains presence/non-empty/entry shape, accumulates field errors, and returns typed `PackageManifest` on success.

**Target pattern:** per-rule helpers:
- `validateManifestObject(raw): { ok: true; value: Record<string, unknown> } | { ok: false; errors: ManifestValidationError[] }`
- `validatePackageName(value: unknown): ManifestValidationError | undefined`
- `validateRequiredString(field, value): ManifestValidationError | undefined`
- `validateDomainsField(value: unknown): ManifestValidationError | undefined`
- `toPackageManifest(obj: Record<string, unknown>): PackageManifest`

**Coverage status:** `add-characterization-tests` — existing `tests/packages/manifest.test.ts:88` covers valid manifests; `tests/packages/manifest.test.ts:145` covers missing fields/non-object broadly; `tests/packages/manifest.test.ts:241` covers invalid names; `tests/packages/manifest.test.ts:310` covers domain array/entry errors. Add pre-refactor tests asserting `null`, array input, and non-object scalar inputs such as string and number each return exactly the four required-missing-field errors. Assert the exact missing-field set and preserve order if the current implementation guarantees order.

**TDD note:** yes for per-field validators.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/packages/manifest.ts:60`.
- Commit the change as a single commit: `W4-02: Refactor lib/packages/manifest.ts validateManifest`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 4 / W4-02

<!-- AC:BEGIN -->
- [ ] #1 Added non-object/null/array missing-field characterization tests are green before refactor.
- [ ] #2 No CLI shared types are imported into lib/packages/manifest.ts.
- [ ] #3 Suppression at lib/packages/manifest.ts:60 is removed.
- [ ] #4 Error accumulation behavior, including required missing-field set/order covered by tests, is preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
