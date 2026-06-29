---
id: TASK-418
title: Migrate explicit coding framework tests to synthetic coding packages
status: To Do
priority: medium
labels:
  - testing
  - backend
  - api
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-417
createdAt: '2026-06-26T15:43:58.439Z'
updatedAt: '2026-06-26T15:43:58.439Z'
---

## Description

Repoint framework tests that intentionally preserve explicit `coding` behavior away from real bundled coding content and toward synthetic installed `coding` packages. This task owns B-015 and B-016. Planned-behavior tests must include markers near executable tests: `@cosmo-behavior plan:coding-agnostic-framework#B-015` and `#B-016`.

<!-- AC:BEGIN -->
- [ ] #1 B-015 main/cosmo validation uses built-in shared+main plus a synthetic minimal `coding` package and has no dependency on `bundled/coding` files.
- [ ] #2 B-016 explicit `-d coding` / `-a cody` dump-prompt behavior uses a synthetic installed `coding` package while preserving `coding/cody` output.
- [ ] #3 Explicit user-facing coding behavior remains unchanged while tests would pass without real bundled coding content.
<!-- AC:END -->
