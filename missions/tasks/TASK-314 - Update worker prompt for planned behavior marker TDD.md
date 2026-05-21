---
id: TASK-314
title: Update worker prompt for planned behavior marker TDD
status: To Do
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-310
createdAt: '2026-05-21T21:31:31.715Z'
updatedAt: '2026-05-21T21:31:31.715Z'
---

## Description

Update the worker prompt so implementation agents apply the TDD skill differently for planned behaviors versus direct fixes.

<!-- AC:BEGIN -->
- [ ] #1 B-005 is covered by `tests/prompts/worker.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-005` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/worker.md` tells workers to use `/skill:tdd` when a task owns planned `B-###` behaviors.
- [ ] #3 Planned behavior RED tests must carry the matching `@cosmo-behavior plan:<slug>#B-###` marker near the executable test.
- [ ] #4 Direct fixes still require a regression test first but no marker ceremony unless tied to a plan.
- [ ] #5 The prompt does not introduce runtime marker scanning or gate enforcement beyond the approved guidance.
<!-- AC:END -->
