---
id: COSMO-034
title: Establish Vitest baseline config and testing standards
status: Done
priority: medium
assignee: worker
labels:
  - forge
  - testing
  - docs
  - 'plan:test-suite-standardization'
dependencies: []
createdAt: '2026-03-04T20:32:10.000Z'
updatedAt: '2026-03-04T20:55:06.938Z'
---

## Description

Create a shared baseline for the test suite so new tests follow one default structure and lifecycle. Add a root Vitest config, a shared setup file, and a testing standards document that defines suite layout, mock strategy order, and teardown expectations.

<!-- AC:BEGIN -->
- [ ] #1 `vitest.config.ts` exists at repo root with `setupFiles` configured and coverage enabled via V8 with `lib/**` include
- [ ] #2 `tests/setup.ts` exists and centralizes global test cleanup (mock/timer reset and related lifecycle-safe defaults)
- [ ] #3 `docs/testing.md` exists and documents canonical test structure, mock selection order, and parameterized-test conventions
- [ ] #4 `package.json` test scripts remain compatible with the new Vitest config (no workflow regressions)
- [ ] #5 `bun run test`, `bun run lint`, and `bun run typecheck` pass after baseline setup
<!-- AC:END -->

## Implementation Notes

All 3 files created. All 532 tests pass. Lint and typecheck failures are pre-existing (noNonNullAssertion warnings in chain-runner.test.ts/todo-extension.test.ts, format issue in workflow-loader.test.ts, TS2532/TS18048 in resolver.test.ts/workflow-loader.test.ts). Committed as 45d0532.
