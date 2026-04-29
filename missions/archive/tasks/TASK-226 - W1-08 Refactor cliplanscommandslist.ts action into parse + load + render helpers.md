---
id: TASK-226
title: >-
  W1-08: Refactor cli/plans/commands/list.ts action into parse + load + render
  helpers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:57:18.635Z'
updatedAt: '2026-04-29T15:18:10.344Z'
---

## Description

Refactor the Commander `.action` closure at `cli/plans/commands/list.ts:15` into named status-parse/load/render helpers, removing the complexity suppression.

**Suppression:** `cli/plans/commands/list.ts:15`, Commander `.action(async (options) => ...)`.

**Current responsibilities:** validates optional status filter, lists plans, gets task-count summaries, renders empty/table/plain/JSON outputs, and handles errors.

**Target pattern:** command service/helpers:
- `parsePlanStatusFilter(status?: string): CliParseResult<PlanStatus | undefined>`
- `loadPlanSummaries(planManager: PlanManager, taskManager: TaskManager, status?: PlanStatus): Promise<PlanSummary[]>`
- `renderPlanSummaries(summaries: readonly PlanSummary[], mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/cli/plans/commands/list.test.ts:12` tests manager listing/summaries, not CLI output/error; add: invalid status JSON/human, empty human output, JSON/plain/table outputs with task count, and manager error.

**TDD note:** yes for parse/render helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/plans/commands/list.ts:15`.
- Commit the change as a single commit: `W1-08: Refactor cli/plans/commands/list.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-08

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Shared table rendering is used for human output.
- [ ] #3 Suppression at cli/plans/commands/list.ts:15 is removed.
- [ ] #4 Task-count summary behavior is preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
