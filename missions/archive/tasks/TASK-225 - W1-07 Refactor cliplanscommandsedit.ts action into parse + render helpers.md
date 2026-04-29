---
id: TASK-225
title: 'W1-07: Refactor cli/plans/commands/edit.ts action into parse + render helpers'
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:57:10.156Z'
updatedAt: '2026-04-29T15:13:39.573Z'
---

## Description

Refactor the Commander `.action` closure at `cli/plans/commands/edit.ts:25` into named parse/render helpers, removing the complexity suppression.

**Suppression:** `cli/plans/commands/edit.ts:25`, Commander `.action(async (slug, options) => ...)`.

**Current responsibilities:** validates status, builds `PlanUpdateInput`, processes escaped newlines, rejects no-change invocations, persists via `PlanManager.updatePlan`, renders JSON/plain/human outputs, and handles errors.

**Target pattern:** command service/helpers:
- `buildPlanUpdate(options: PlanEditCliOptions): CliParseResult<{ updateInput: PlanUpdateInput; changedFields: string[] }>`
- `renderPlanEditSuccess(plan: Plan, changedFields: readonly string[], mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/plans/commands/edit.test.ts:9` tests `PlanManager.updatePlan` directly, not CLI validation/output; add: invalid status, no changes, escaped body/spec newlines, JSON/plain/human success, and manager error/not found.

**TDD note:** yes for parse/render helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/plans/commands/edit.ts:25`.
- Commit the change as a single commit: `W1-07: Refactor cli/plans/commands/edit.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-07

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Action delegates update construction and rendering.
- [ ] #3 Suppression at cli/plans/commands/edit.ts:25 is removed.
- [ ] #4 Existing PlanManager tests remain unchanged or green after fixture cleanup.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
