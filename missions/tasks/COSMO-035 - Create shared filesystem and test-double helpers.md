---
id: COSMO-035
title: Create shared filesystem and test-double helpers
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
updatedAt: '2026-03-04T21:00:49.331Z'
---

## Description

Reduce duplication across test files by introducing shared helpers for temp directories and common manual test doubles. Migrate filesystem-heavy tests to use these helpers so per-file setup/teardown boilerplate is minimized.

<!-- AC:BEGIN -->
- [ ] #1 `tests/helpers/fs.ts` provides reusable temp-dir helpers used by filesystem-oriented tests
- [ ] #2 `tests/helpers/mocks/` contains canonical factories for recurring manual doubles (for example Pi/session/spawner collaborators where appropriate)
- [ ] #3 At least three existing test files with duplicated `mkdtemp`/`rm` logic are migrated to shared helpers
- [ ] #4 Migrated tests keep behavior parity and remain self-contained in intent (no hidden global state)
- [ ] #5 `bun run test`, `bun run lint`, and `bun run typecheck` pass after helper rollout
<!-- AC:END -->

## Implementation Notes

Created:\n- `tests/helpers/fs.ts` — `useTempDir(prefix)` returns `{ path }` ref managed by beforeEach/afterEach\n- `tests/helpers/mocks/extension-api.ts` — `createMockPi(options?)` canonical ExtensionAPI double with tools, events, entries, callTool, fireEvent\n- `tests/helpers/mocks/index.ts` — barrel export\n\nMigrated 4 test files:\n1. `tests/config/loader.test.ts` — fs helper\n2. `tests/prompts/loader.test.ts` — fs helper\n3. `tests/workflows/workflow-loader.test.ts` — fs helper\n4. `tests/extensions/task-plan-linkage.test.ts` — both fs + mock helpers\n\nPre-existing typecheck errors in workflow-loader.test.ts (noUncheckedIndexedAccess on DEFAULT_WORKFLOWS[0]) and resolver.test.ts were not introduced by this change. Pre-existing lint warnings (non-null assertions in other test files) also unchanged.\n\nOther test files with mkdtemp patterns (plans.test.ts, todo-extension.test.ts, tasks/*.test.ts, plans/*.test.ts, orchestration/chain-runner.test.ts) are candidates for future migration."
