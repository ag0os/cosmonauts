---
id: TASK-419
title: Repoint remaining Bucket B framework tests away from real bundled coding
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-417
createdAt: '2026-06-26T15:44:04.129Z'
updatedAt: '2026-06-29T17:59:30.566Z'
---

## Description

Migrate the remaining Bucket B framework tests to synthetic package fixtures or local synthetic definitions/chains instead of real bundled `coding`. This task owns the Bucket B migration portion of B-017; final ledger validation for B-017 is completed in TASK-421. Planned-behavior tests added or updated in this task must include marker `@cosmo-behavior plan:coding-agnostic-framework#B-017` near the executable proof where applicable.

<!-- AC:BEGIN -->
- [x] #1 B-017 Bucket B tests named in the plan no longer import, load, or read real `bundled/coding` as a generic package, prompt, skill, scaffold, or runtime fixture.
- [x] #2 Agent-spawner and orchestration Bucket B tests use explicit synthetic domains or synthetic installable packages rather than domainless fixtures that accidentally rely on `main` or bundled `coding`.
- [x] #3 Bucket A coding-content tests and explicit Wave-2 catalog-source tests remain unchanged for Wave 2.
- [x] #4 Remaining real bundled-coding references after the migration are limited to intended Bucket A or Keep cases so TASK-421 can classify them in the ledger without further Bucket B fixture work.
<!-- AC:END -->
