---
id: TASK-385
title: Implement package root domain source semantics and validation
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:domain-authoring'
dependencies: []
createdAt: '2026-06-23T21:13:38.446Z'
updatedAt: '2026-06-23T21:19:31.449Z'
---

## Description

Implementation Order step 1 foundation. Formalize single-domain package roots as exact `domain-root` sources for installed packages, and enforce package manifest validation before any bundled migration work. This task owns B-002, B-021, and B-022; planned behavior tests must include the exact `@cosmo-behavior plan:domain-authoring#B-###` markers near the executable tests.

<!-- AC:BEGIN -->
- [x] #1 B-002 installed packages with `cosmonauts.json` domain entry `{ name, path: "." }` load the package root as the domain root without same-name nesting, proven in `tests/packages/scanner.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-002`.
- [x] #2 B-021 package validation rejects a root-domain package missing root `domain.ts` before writing to the store, proven in `tests/packages/installer.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-021`.
- [x] #3 B-022 package validation rejects `path: "."` when any other domain is declared in the same package and prevents package-store parent scanning, proven in `tests/packages/installer.test.ts` with exact marker `@cosmo-behavior plan:domain-authoring#B-022`.
- [x] #4 The package scanner/installer behavior preserves existing multi-domain subfolder package loading semantics while adding the root-domain case.
<!-- AC:END -->
