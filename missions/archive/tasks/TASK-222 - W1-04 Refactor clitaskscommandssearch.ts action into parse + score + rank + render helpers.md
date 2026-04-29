---
id: TASK-222
title: >-
  W1-04: Refactor cli/tasks/commands/search.ts action into parse + score + rank
  + render helpers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:56:40.380Z'
updatedAt: '2026-04-29T14:58:14.881Z'
---

## Description

Refactor the Commander `.action` closure at `cli/tasks/commands/search.ts:116` into named search-parse/score/rank/render helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/search.ts:116`, Commander `.action(async (query, options) => ...)`.

**Current responsibilities:** normalizes status/priority/label filters, parses positive limit, calls `TaskManager.search`, scores/sorts by title/description/notes/plan relevance, applies limit, renders no-results/table/plain/JSON outputs, and handles errors.

**Target pattern:** command service/helpers:
- `parseTaskSearchOptions(options: TaskSearchCliOptions): CliParseResult<{ filter?: TaskListFilter; limit: number }>`
- `scoreTaskForQuery(task: Task, query: string): number`
- `rankTaskSearchResults(tasks: readonly Task[], query: string, limit: number): Task[]`
- `renderTaskSearchResults(tasks: readonly Task[], query: string, mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:437` covers manager search but not CLI relevance sorting/limit/output validation; add: title exact/starts-with ranking, invalid status/priority/limit, empty results human output, plain/table/JSON modes, and manager error.

**TDD note:** yes for score/rank/render helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/search.ts:116`.
- Commit the change as a single commit: `W1-04: Refactor cli/tasks/commands/search.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-04

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Relevance scoring behavior remains unchanged.
- [ ] #3 Suppression at cli/tasks/commands/search.ts:116 is removed.
- [ ] #4 Search output modes preserve current strings and table columns.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
