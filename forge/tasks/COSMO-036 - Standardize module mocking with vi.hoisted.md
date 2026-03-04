---
id: COSMO-036
title: Standardize module mocking with vi.hoisted
status: Done
priority: medium
assignee: worker
labels:
  - forge
  - testing
  - refactor
  - 'plan:test-suite-standardization'
dependencies:
  - COSMO-034
createdAt: '2026-03-04T20:32:10.000Z'
updatedAt: '2026-03-04T21:05:49.208Z'
---

## Description

Make module-level mock intent explicit in orchestration and extension tests by using `vi.hoisted()` for pre-import mock references. Standardize typing with `vi.mocked()` where mocked modules/functions are consumed in assertions.

<!-- AC:BEGIN -->
- [x] #1 A documented `vi.hoisted()` pattern is added to `docs/testing.md` for module-level mocking
- [x] #2 Tests that currently rely on implicit Vitest mock hoisting are migrated to explicit `vi.hoisted()` references where needed
- [x] #3 Mocked module usage in migrated files is type-safe (`vi.mocked()` or equivalent typed references)
- [x] #4 No change in covered behavior or assertions after migration (refactor-only intent)
- [x] #5 `bun run test`, `bun run lint`, and `bun run typecheck` pass after mock-pattern migration
<!-- AC:END -->

## Implementation Notes

Migrated two test files to vi.hoisted():\n\n- **tests/extensions/orchestration.test.ts**: Extracted 4 vi.fn() calls from vi.mock() factories into a centralized `mocks` object via vi.hoisted(). Kept existing vi.mocked() typed references in the describe block.\n\n- **tests/orchestration/chain-runner.test.ts**: Replaced module-level `let mockSpawnerForModule` with a `spawnerRef` object via vi.hoisted() using the `{ current }` ref pattern for mutable per-test state.\n\n- **docs/testing.md**: Added vi.hoisted() section with two patterns (centralized mock object, mutable ref wrapper) and updated the guidelines to mention vi.hoisted().\n\nPre-existing issues (not introduced by this task):\n- typecheck: 6 errors in resolver.test.ts and workflow-loader.test.ts (possibly undefined)\n- lint: ~20 noNonNullAssertion warnings across test files"
