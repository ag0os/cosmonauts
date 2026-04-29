---
id: TASK-246
title: 'W5-01a: De-baseline residual duplicate clone families after Waves 0-4'
status: Done
priority: medium
labels:
  - 'wave:5'
  - 'area:capstone'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
  - TASK-219
  - TASK-220
  - TASK-221
  - TASK-222
  - TASK-223
  - TASK-224
  - TASK-225
  - TASK-226
  - TASK-227
  - TASK-228
  - TASK-229
  - TASK-230
  - TASK-231
  - TASK-232
  - TASK-233
  - TASK-234
  - TASK-235
  - TASK-236
  - TASK-237
  - TASK-238
  - TASK-239
  - TASK-240
  - TASK-241
  - TASK-242
  - TASK-243
  - TASK-244
  - TASK-245
createdAt: '2026-04-29T14:01:40.954Z'
updatedAt: '2026-04-29T17:01:51.579Z'
---

## Description

After all Wave 0/1/2/3/4 tasks land, audit and clean residual duplicate clone families reported by `fallow dupes` against the post-Wave-4 tree, leaving `.fallow/baselines/dupes.json` and `audit.dupesBaseline` config in place for this task only.

**Files:** keep `fallow.toml` and `.fallow/baselines/dupes.json` in place during this task; modify only the source/test files needed to eliminate residual clone groups reported by `fallow dupes` against the post-Wave-4 tree.

**Current state:** `.fallow/baselines/dupes.json` baselines far more than CLI command clones, including runtime, orchestration, extensions, package scanner/installer/eject/store, domain validation/assembly tests, session tests, workflow/config tests, and task/package manager clones.

**Target pattern:** remove structural duplicates family-by-family with the smallest local helper, parameterized test table, or inline collapse that improves readability; do not create broad shared utilities with only one effective call site.

**Expected residual clone families and required treatment:**
1. CLI command output/prompt/error clones (`cli/plans/commands/*`, `cli/tasks/commands/*`, command tests): consume Wave 0 CLI output/error/test helpers; extract only command-local render/prompt helpers when still duplicated after Wave 1.
2. CLI package/update/eject install-source and fixture clones (`cli/update/subcommand.ts`, `cli/packages/subcommand.ts`, `lib/packages/installer.ts`, package/update/eject tests): consolidate source-request/fixture setup where already shared by 3+ call sites; otherwise collapse repeated test cases with tables.
3. Orchestration extension/spawner lineage/activity clones (`domains/shared/extensions/orchestration/*`, `lib/orchestration/agent-spawner.ts`, orchestration extension/lineage tests): reuse existing transcript/manifest persistence helpers and extract shared test session/tracker fixtures under `tests/helpers/` only when the duplicate setup spans multiple test files.
4. Chain runner/parser/profiler test clones (`tests/orchestration/chain-*.test.ts`): replace repeated agent/registry/stage setup with local test builders or table-driven assertions while preserving one-concept-per-test naming.
5. Domain/runtime/workflow/config test setup clones (`tests/domains/*`, `tests/runtime.test.ts`, `tests/workflows/*`, `tests/config/*`, `tests/agents/*`): introduce domain/runtime fixture builders only for repeated manifest/domain definitions; do not hide assertion-specific data.
6. Package scanner/installer/eject/store/manifest test clones (`tests/packages/*`): consolidate repeated manifest/package directory builders and convert symmetric cases to parameterized tests.
7. Task/session/todo test clones (`tests/tasks/*`, `tests/sessions/*`, `tests/cli/session.test.ts`, `tests/todo/*`): reuse task/session fixture helpers from Wave 0b or add narrow local builders for repeated session/task record shapes.
8. Production extension/tool handler clones outside inline suppressions (`domains/shared/extensions/plans/index.ts`, `domains/shared/extensions/tasks/index.ts`, `lib/tasks/task-manager.ts` update branches): extract local helper functions only where the same validation/response pattern repeats in the same module.

**Coverage status:** `existing-coverage-sufficient` for behavior after Waves 0-4, with targeted characterization only if a residual clone family involves production behavior not already covered.

**TDD note:** no for mechanical duplicate collapse; yes if W5-01a introduces a new shared test/source helper contract.

**Worker contract:**
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Commit the change as a single commit: `W5-01a: De-baseline residual duplicate clone families`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 5 / W5-01a

<!-- AC:BEGIN -->
- [ ] #1 Before changes, run fallow dupes and save/list the remaining clone groups from .fallow/baselines/dupes.json that still apply after Waves 0-4.
- [ ] #2 Every remaining clone group is assigned to one of the expected residual clone families above and addressed by extraction, local builder/table conversion, or inline collapse.
- [ ] #3 No new production dependency points from library/domain modules into CLI modules or test helpers.
- [ ] #4 fallow dupes reports no residual clone groups that would be unbaselined by W5-01b.
- [ ] #5 fallow audit, bun run test, bun run lint, and bun run typecheck are green with the baseline still configured.
<!-- AC:END -->

## Implementation Notes

Codex-implemented in two commits because session token budget was exceeded mid-task:
- 7463b91 TASK-246 (progress 1/2): extracted shared helpers (cli/shared/prompt.ts, orchestration/schema.ts, lib/orchestration/duration.ts, tests/helpers/packages.ts) and consolidated 27 consumer files. -272 net lines. 18 clone groups still warned.
- a72b7f8 TASK-246 (progress 2/2): focused continuation prompt eliminated the remaining 18 clone groups via 4 new test helpers (orchestration-helpers, orchestration-mocks, delete-command-tests, readline). -633 net lines. fallow audit reports zero clone groups.

Combined: 9 new helper files, 33 files modified, ~905 net lines deleted. All four verifications green at HEAD a72b7f8. AC #4 met — no residuals would be unbaselined by W5-01b.
