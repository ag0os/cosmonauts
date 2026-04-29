---
id: TASK-245
title: >-
  W4-05: Refactor lib/tasks/task-manager.ts matchesFilter into predicate
  composition
status: Done
priority: medium
labels:
  - 'wave:4'
  - 'area:validation'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T14:01:04.553Z'
updatedAt: '2026-04-29T16:31:20.862Z'
---

## Description

Refactor the private `matchesFilter(task, filter)` function at `lib/tasks/task-manager.ts:351` into a predicate array composition, removing the complexity suppression.

**Suppression:** `lib/tasks/task-manager.ts:351`, private `matchesFilter(task, filter)`.

**Current responsibilities:** applies status (single/multiple), priority (single/multiple, missing priority fails), assignee case-insensitive exact match, label case-insensitive match, and has-no-dependencies predicate; all predicates are AND-composed.

**Target pattern:** predicate composition:
```ts
type TaskFilterPredicate = (task: Task, filter: TaskListFilter) => boolean
```
- `matchesStatusFilter(task, filter): boolean`
- `matchesPriorityFilter(task, filter): boolean`
- `matchesAssigneeFilter(task, filter): boolean`
- `matchesLabelFilter(task, filter): boolean`
- `matchesDependencyFilter(task, filter): boolean`
- `const TASK_FILTER_PREDICATES: readonly TaskFilterPredicate[]`

**Coverage status:** `add-characterization-tests` — existing `tests/tasks/task-manager.test.ts:332` covers listing; `tests/tasks/task-manager.test.ts:344` status; `tests/tasks/task-manager.test.ts:358` multiple statuses; `tests/tasks/task-manager.test.ts:373` priority; `tests/tasks/task-manager.test.ts:384` assignee case-insensitive; `tests/tasks/task-manager.test.ts:395` label case-insensitive; `tests/tasks/task-manager.test.ts:406` hasNoDependencies; `tests/tasks/task-manager.test.ts:419` combined filters. Add pre-refactor tests that `priority: ["high", "low"]` returns tasks matching either priority and that a task with no priority is excluded whenever any priority filter is applied.

**TDD note:** yes for predicate helpers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/tasks/task-manager.ts:351`.
- Commit the change as a single commit: `W4-05: Refactor lib/tasks/task-manager.ts matchesFilter`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 4 / W4-05

<!-- AC:BEGIN -->
- [ ] #1 Added multiple-priority and missing-priority characterization tests are green before refactor.
- [ ] #2 matchesFilter delegates to predicate array and preserves AND semantics.
- [ ] #3 Suppression at lib/tasks/task-manager.ts:351 is removed.
- [ ] #4 TaskManager public API remains unchanged.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
