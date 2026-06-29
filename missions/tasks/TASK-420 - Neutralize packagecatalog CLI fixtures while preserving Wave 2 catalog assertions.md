---
id: TASK-420
title: >-
  Neutralize package/catalog CLI fixtures while preserving Wave 2 catalog
  assertions
status: To Do
priority: medium
labels:
  - testing
  - api
  - backend
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-417
createdAt: '2026-06-26T15:44:10.094Z'
updatedAt: '2026-06-26T15:48:18.217Z'
---

## Description

Reconcile package, export, skills, update, and catalog tests so generic fixtures are neutral while production `coding -> ./bundled/coding` catalog assertions stay in Wave 1. This task owns the package/catalog fixture migration portion of B-024; final ledger/catalog classification for B-024 is completed in TASK-421. Planned-behavior tests added or updated in this task must include marker `@cosmo-behavior plan:coding-agnostic-framework#B-024` near the executable proof where applicable.

<!-- AC:BEGIN -->
- [ ] #1 B-024 generic mocked package/catalog CLI fixtures use neutral package and domain ids instead of `coding` or `/bundled/coding`.
- [ ] #2 B-024 package/export/skills/update CLI tests no longer depend on `/bundled/coding` for generic fixture behavior.
- [ ] #3 B-024 production catalog-source assertions for `coding` and `./bundled/coding` remain byte-for-byte Wave-1 keeps, with no `lib/packages/catalog.ts` scope leakage.
- [ ] #4 Remaining package/catalog `coding` references are isolated to production Wave-2 Keep assertions so TASK-421 can classify them in the ledger without further fixture neutralization.
<!-- AC:END -->
