---
id: TASK-309
title: Refactor task skill to preserve planned behavior ownership
status: Done
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
createdAt: '2026-05-21T21:31:03.749Z'
updatedAt: '2026-05-21T22:01:18.842Z'
---

## Description

Refactor `/skill:task` to consume behavior-first plans and tactical bugfix guidance. Before editing any skill files, the worker must load `/skill:creating-skills`; for simple edits read `references/foundations.md` and `references/evaluation.md`, and if splitting into references also read `references/architecture.md`.

<!-- AC:BEGIN -->
- [ ] #1 B-006, B-002, and B-020 are covered by `tests/prompts/task-skill.test.ts`, with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 `domains/shared/skills/task/SKILL.md` owns task format, task tools, dependency rules, status flow, and acceptance-criteria writing while routing artifact-format details to `/skill:work-artifacts`.
- [ ] #3 Task guidance preserves owned `B-###` behavior IDs in task acceptance criteria and carries behavior marker expectations into worker context.
- [ ] #4 Every behavior cluster from a plan is assigned to at least one task without requiring workers to invent missing artifact architecture.
- [ ] #5 Tactical bugfix guidance allows regression tests to serve as behavior records without requiring a full spec/plan/architecture stack.
- [ ] #6 Optional task references such as lifecycle or behavior mapping are directly linked from the dispatcher if introduced, with no deep reference chains.
<!-- AC:END -->
