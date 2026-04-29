---
id: TASK-219
title: >-
  W1-01: Refactor cli/tasks/commands/create.ts action into parse + render
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
createdAt: '2026-04-29T13:56:14.697Z'
updatedAt: '2026-04-29T14:21:57.510Z'
---

## Description

Refactor the Commander `.action` closure at `cli/tasks/commands/create.ts:37` into named parse/render helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/create.ts:37`, Commander `.action(async (title, options) => ...)`.

**Current responsibilities:** validates priority and due date, builds `TaskCreateInput`, persists via `TaskManager.createTask`, and emits JSON/plain/human success or error output.

**Target pattern:** command service/helpers:
- `parseTaskCreateInput(title: string, options: TaskCreateCliOptions): CliParseResult<TaskCreateInput>`
- `parseTaskDueDate(value: string | undefined): CliParseResult<Date | undefined>`
- `renderTaskCreateSuccess(task: Task, mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:65` covers manager persistence, but no CLI action output/error coverage exists; add CLI tests for: valid full create, invalid priority, invalid date in JSON and human modes, plain output prints ID, and manager error output.

**TDD note:** yes for pure parse/render helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/create.ts:37`.
- Commit the change as a single commit: `W1-01: Refactor cli/tasks/commands/create.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-01

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Action delegates parsing/rendering to named helpers parseTaskCreateInput, parseTaskDueDate, and renderTaskCreateSuccess.
- [ ] #3 Suppression at cli/tasks/commands/create.ts:37 is removed.
- [ ] #4 JSON/plain/human outputs match characterization tests before and after refactor.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->

## Implementation Notes

Codex-implemented; committed manually as 8a38e95 because codex's --full-auto sandbox blocks .git/index.lock writes. Implementation extracted parseTaskCreateInput, parseTaskDueDate, renderTaskCreateSuccess; suppression removed; 20 new characterization tests added. All four verification commands green (1621 tests pass). Driver template updated for subsequent tasks: codex stops at "ready to commit", driver handles staging + commit.
