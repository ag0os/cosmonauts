---
type: trade-off
title: Fence-aware task grammar only from the notes heading onward
description: >-
  Headings inside fenced code are inert only in and after Implementation Notes;
  a globally fence-aware grammar would change how an archived task with an
  unclosed fence in its description parses.
resource: >-
  knowledge/driver-hardening/trade-off-fence-aware-task-grammar-only-from-the-notes-heading-onward-59c1df65cbd0.md
tags:
  - D-039
  - parser
  - tasks
timestamp: '2026-09-30T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/driver-hardening/plan.md
date: '2026-09-30T00:00:00.000Z'
---
# Fence-aware task grammar only from the notes heading onward

To keep raw worker text verbatim and inert inside Drive records, the shared section scanner treats a "## " line inside a fenced block as not-a-heading. Applying that globally changed the parse of archived TASK-185, whose description opens a fence that closes only at end of file, so the corpus would no longer round-trip. The rule is therefore scoped: sections before Implementation Notes keep the plain line grammar; from the notes heading onward fences are tracked. Old and new parsers agree on every task file in missions/tasks and missions/archive/tasks.

Accepted costs: an unfenced recognized heading in appended worker notes (the worker's own task_edit path is unfenced) still ends the notes section early and can lose what follows at the next status change (pre-existing on base, improvement row 21); the boundary itself is now structural (D-040) so the scan cannot run past the notes.
