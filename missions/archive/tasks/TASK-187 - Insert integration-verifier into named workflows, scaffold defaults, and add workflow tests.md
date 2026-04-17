---
id: TASK-187
title: >-
  Insert integration-verifier into named workflows, scaffold defaults, and add
  workflow tests
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:integration-verifier'
dependencies:
  - TASK-185
createdAt: '2026-04-14T19:28:58.150Z'
updatedAt: '2026-04-14T19:40:26.007Z'
---

## Description

Wire the new stage into the five roadmap-listed built-in workflows, update the scaffolded default config, and add/update tests that verify stage placement and config behavior.

**Files to modify:**
- `bundled/coding/coding/workflows.ts` — insert `integration-verifier` immediately before `quality-manager` in exactly these chains: `plan-and-build`, `reviewed-plan-and-build`, `tdd`, `spec-and-build`, `adapt`. Do NOT modify `implement`, `plan-and-tdd`, `spec-and-tdd`, or `verify`.
- `lib/config/defaults.ts` — update `createDefaultProjectConfig()` so the scaffolded `plan-and-build` chain becomes `"planner -> task-manager -> coordinator -> integration-verifier -> quality-manager"`.

**Tests to create/update:**
- `tests/domains/coding-workflows.test.ts` — **new file**: assert that in the bundled coding workflows, `integration-verifier` appears immediately before `quality-manager` in `plan-and-build`, `reviewed-plan-and-build`, `tdd`, `spec-and-build`, and `adapt`; assert `integration-verifier` does NOT appear in `implement`, `plan-and-tdd`, `spec-and-tdd`, or `verify`.
- `tests/config/scaffold.test.ts` — add assertions that the scaffolded `plan-and-build` chain string includes `integration-verifier` and that `integration-verifier` precedes `quality-manager` in it.
- `tests/prompts/loader.test.ts` — add a test that `bundled/coding/coding/prompts/integration-verifier.md` can be loaded without error (use the existing `loadPrompt` helper pattern).

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/coding/workflows.ts chains for plan-and-build, reviewed-plan-and-build, tdd, spec-and-build, and adapt each contain "integration-verifier" immediately before "quality-manager"
- [ ] #2 implement, plan-and-tdd, spec-and-tdd, and verify chains are unchanged (no integration-verifier insertion)
- [ ] #3 lib/config/defaults.ts scaffolded plan-and-build chain includes integration-verifier before quality-manager
- [ ] #4 tests/domains/coding-workflows.test.ts (new file) asserts correct stage placement for all five in-scope chains and absence from the four out-of-scope chains
- [ ] #5 tests/config/scaffold.test.ts asserts the scaffolded plan-and-build chain contains integration-verifier immediately before quality-manager
- [ ] #6 tests/prompts/loader.test.ts includes a test that integration-verifier.md loads without error
<!-- AC:END -->

## Implementation Notes

Completed AC1-AC6.
- Inserted integration-verifier immediately before quality-manager in the bundled coding workflows for plan-and-build, reviewed-plan-and-build, tdd, spec-and-build, and adapt.
- Left implement, plan-and-tdd, spec-and-tdd, and verify unchanged.
- Updated createDefaultProjectConfig() so scaffolded plan-and-build includes integration-verifier before quality-manager.
- Added tests/domains/coding-workflows.test.ts for in-scope placement and out-of-scope absence.
- Extended tests/config/scaffold.test.ts to assert scaffolded plan-and-build contains integration-verifier before quality-manager.
- Extended tests/prompts/loader.test.ts with an explicit integration-verifier prompt load test.
Verification: bun run test -- tests/domains/coding-workflows.test.ts tests/config/scaffold.test.ts tests/prompts/loader.test.ts; bun run typecheck; bun run lint.
Commit: 6d23fc8
