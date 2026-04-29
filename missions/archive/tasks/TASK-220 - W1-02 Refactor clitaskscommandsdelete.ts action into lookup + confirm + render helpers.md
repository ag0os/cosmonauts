---
id: TASK-220
title: >-
  W1-02: Refactor cli/tasks/commands/delete.ts action into lookup + confirm +
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
createdAt: '2026-04-29T13:56:23.518Z'
updatedAt: '2026-04-29T14:47:28.633Z'
---

## Description

Refactor the Commander `.action` closure at `cli/tasks/commands/delete.ts:33` into named lookup/confirmation/render helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/delete.ts:33`, Commander `.action(async (taskId, options) => ...)`.

**Current responsibilities:** loads task, handles not-found errors, prompts unless `--force`, handles cancellation output, deletes through `TaskManager.deleteTask`, and emits JSON/plain/human success or error output.

**Target pattern:** command service/helpers:
- `loadTaskForDeletion(manager: TaskManager, taskId: string): Promise<CliParseResult<Task>>`
- `confirmTaskDeletion(task: Task, force?: boolean): Promise<boolean>`
- `renderTaskDeleteResult(result: TaskDeleteResult, mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:302` covers manager deletion, but no CLI prompt/cancel/output tests exist; add: force delete, not found JSON/human, cancellation JSON/plain/human, and manager error cases.

**TDD note:** yes for render helper; no for readline prompt wrapper.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/delete.ts:33`.
- Commit the change as a single commit: `W1-02: Refactor cli/tasks/commands/delete.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-02

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Action delegates lookup, confirmation, deletion result rendering, and error printing.
- [ ] #3 Suppression at cli/tasks/commands/delete.ts:33 is removed.
- [ ] #4 Cancellation does not call deleteTask and preserves existing output.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
