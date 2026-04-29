---
id: TASK-223
title: >-
  W1-05: Refactor cli/tasks/commands/view.ts outputFormatted into per-section
  renderers
status: Done
priority: medium
labels:
  - 'wave:1'
  - 'area:cli-commands'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-217
  - TASK-218
createdAt: '2026-04-29T13:56:50.230Z'
updatedAt: '2026-04-29T15:02:42.611Z'
---

## Description

Refactor the private `outputFormatted(task)` function at `cli/tasks/commands/view.ts:82` into per-section renderer helpers, removing the complexity suppression.

**Suppression:** `cli/tasks/commands/view.ts:82`, private `outputFormatted(task: Task)`.

**Current responsibilities:** renders header, metadata, description with AC marker stripping, implementation plan, acceptance criteria, and implementation notes in one function.

**Target pattern:** per-section renderers:
- `renderTaskHeader(task: Task): string[]`
- `renderTaskMetadata(task: Task): string[]`
- `renderTaskDescription(task: Task): string[]`
- `renderTaskImplementationPlan(task: Task): string[]`
- `renderTaskAcceptanceCriteria(task: Task): string[]`
- `renderTaskImplementationNotes(task: Task): string[]`
- `renderFormattedTask(task: Task): string[]`

`outputFormatted` is replaced by `printLines(renderFormattedTask(task))` or equivalent.

**Coverage status:** `add-characterization-tests` — no direct tests for task command view; add: formatted output for all sections, omitted optional sections, AC marker stripping, due date formatting, JSON not-found, plain output escaping, and manager error.

**TDD note:** yes for per-section renderers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `cli/tasks/commands/view.ts:82`.
- Commit the change as a single commit: `W1-05: Refactor cli/tasks/commands/view.ts outputFormatted`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 1 / W1-05

<!-- AC:BEGIN -->
- [ ] #1 Characterization tests are green before refactor.
- [ ] #2 outputFormatted is replaced by printLines(renderFormattedTask(task)) or equivalent.
- [ ] #3 Suppression at cli/tasks/commands/view.ts:82 is removed.
- [ ] #4 Section order and indentation are preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
