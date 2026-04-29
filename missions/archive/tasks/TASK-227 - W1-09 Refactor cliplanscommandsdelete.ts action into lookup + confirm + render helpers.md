---
id: TASK-227
title: >-
  W1-09: Refactor cli/plans/commands/delete.ts action into lookup + confirm +
  render helpers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:57:27.428Z'
updatedAt: '2026-04-29T15:21:18.709Z'
---

## Description

Refactor the Commander `.action` closure at `cli/plans/commands/delete.ts:28` into named lookup/confirmation/render helpers, removing the complexity suppression.

**Suppression:** `cli/plans/commands/delete.ts:28`, Commander `.action(async (slug, options) => ...)`.

**Current responsibilities:** loads plan, handles not-found errors, prompts unless `--force`, handles cancellation output, deletes through `PlanManager.deletePlan`, and renders JSON/plain/human success or errors.

**Target pattern:** command service/helpers:
- `loadPlanForDeletion(manager: PlanManager, slug: string): Promise<CliParseResult<Plan>>`
- `confirmPlanDeletion(plan: Plan, force?: boolean): Promise<boolean>`
- `renderPlanDeleteResult(result: PlanDeleteResult, mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/plans/commands/delete.test.ts:8` tests `PlanManager.deletePlan`, not CLI prompt/output; add: force delete, cancellation JSON/plain/human, not found JSON/human, and manager error.

**TDD note:** yes for render helper; no for readline prompt wrapper.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/plans/commands/delete.ts:28`.
- Commit the change as a single commit: `W1-09: Refactor cli/plans/commands/delete.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-09

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Action delegates lookup, confirmation, and rendering.
- [ ] #3 Suppression at cli/plans/commands/delete.ts:28 is removed.
- [ ] #4 Cancellation preserves current no-delete behavior.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
