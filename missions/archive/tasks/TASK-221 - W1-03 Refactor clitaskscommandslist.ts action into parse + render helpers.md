---
id: TASK-221
title: 'W1-03: Refactor cli/tasks/commands/list.ts action into parse + render helpers'
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:56:31.504Z'
updatedAt: '2026-04-29T14:52:52.652Z'
---

## Description

Refactor the Commander `.action` closure at `cli/tasks/commands/list.ts:54` into named filter-parse/render helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/list.ts:54`, Commander `.action(async (options) => ...)`.

**Current responsibilities:** normalizes status/priority filters, builds `TaskListFilter`, calls `TaskManager.listTasks`, and renders empty/table/plain/JSON outputs plus errors.

**Target pattern:** command service/helpers:
- `parseTaskListFilter(options: TaskListCliOptions): CliParseResult<TaskListFilter>`
- `renderTaskList(tasks: readonly Task[], mode: CliOutputMode): unknown | string[]`
- `renderTaskRow(task: Task): string`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:332` covers manager filters, but no CLI normalization/output tests exist; add: invalid status, invalid priority, ready filter maps to `hasNoDependencies`, empty human output, table columns, plain output, JSON output, and manager error.

**TDD note:** yes for parse/render helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/list.ts:54`.
- Commit the change as a single commit: `W1-03: Refactor cli/tasks/commands/list.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-03

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Shared CLI renderTable is used for human table output.
- [ ] #3 Suppression at cli/tasks/commands/list.ts:54 is removed.
- [ ] #4 Filter semantics match current manager behavior.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
