---
id: TASK-313
title: Update task-manager prompt to carry behavior IDs into tasks
status: Done
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-307
  - TASK-309
createdAt: '2026-05-21T21:31:26.769Z'
updatedAt: '2026-05-21T22:11:21.147Z'
---

## Description

Update the task-manager prompt so planned behavior ownership survives decomposition into atomic implementation tasks.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is covered by `tests/prompts/task-manager.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-006` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/task-manager.md` requires task acceptance criteria to identify the `B-###` behaviors each task owns.
- [ ] #3 Task-manager guidance preserves marker expectations for workers when a task owns planned behaviors.
- [ ] #4 Every behavior cluster in a plan must be assigned to a task without adding scope outside the approved plan.
- [ ] #5 The prompt distinguishes planned behavior decomposition from tactical bugfix tasks whose regression test is the behavior record.
<!-- AC:END -->
