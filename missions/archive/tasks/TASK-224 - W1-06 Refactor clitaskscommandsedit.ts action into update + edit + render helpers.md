---
id: TASK-224
title: >-
  W1-06: Refactor cli/tasks/commands/edit.ts action into update + edit + render
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
createdAt: '2026-04-29T13:57:01.905Z'
updatedAt: '2026-04-29T15:09:59.384Z'
---

## Description

Refactor the Commander `.action` closure at `cli/tasks/commands/edit.ts:159` into named update-build/edit/render helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/edit.ts:159`, Commander `.action(async (taskId, options) => ...)`.

**Current responsibilities:** fetches existing task, validates status/priority/due date, processes escaped newlines, updates basic fields, plan/notes append/replace, labels, dependencies, acceptance criterion add/remove/check/uncheck with reindexing, no-change errors, persistence, and JSON/plain/human output.

**Target pattern:** command service/helpers:
- `buildTaskUpdate(existing: Task, options: TaskEditCliOptions): CliParseResult<{ updateInput: TaskUpdateInput; changes: FieldChange[] }>`
- `applyTaskLabelEdits(existing: readonly string[], edits: LabelEditOptions): string[]`
- `applyTaskDependencyEdits(existing: readonly string[], edits: DependencyEditOptions): string[]`
- `applyAcceptanceCriterionEdits(existing: readonly AcceptanceCriterion[], edits: AcceptanceCriterionEditOptions): AcceptanceCriterion[]`
- `renderTaskEditSuccess(task: Task, update: TaskUpdateInput, changes: readonly FieldChange[], mode: CliOutputMode): unknown | string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:211` covers manager updates, but no CLI option-composition tests exist; add: invalid status/priority/date, no changes, escaped newlines for description/plan/notes, append plan/notes with separators, add/remove labels case-insensitively, add/remove deps case-insensitively, AC remove reindex/add/check/uncheck, plain changed fields, JSON output, not found, and manager error.

**TDD note:** yes for pure edit helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/edit.ts:159`.
- Commit the change as a single commit: `W1-06: Refactor cli/tasks/commands/edit.ts action`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-06

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 Action delegates update construction and rendering to named helpers.
- [ ] #3 Suppression at cli/tasks/commands/edit.ts:159 is removed.
- [ ] #4 AC reindexing and append separator behavior are preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
