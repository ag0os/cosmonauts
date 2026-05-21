---
id: TASK-315
title: Update plan-reviewer prompt for canonical artifact contract review
status: To Do
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-306
  - TASK-307
  - TASK-308
createdAt: '2026-05-21T21:31:37.559Z'
updatedAt: '2026-05-21T21:31:37.559Z'
---

## Description

Update the plan-reviewer prompt so reviewers consume the canonical artifact contract after `/skill:plan` becomes a dispatcher.

<!-- AC:BEGIN -->
- [ ] #1 B-016 is covered by `tests/prompts/plan-reviewer.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-016` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/plan-reviewer.md` instructs plan-reviewer to load `work-artifacts` while reviewing non-trivial plans.
- [ ] #3 Plan reviews check behavior IDs/markers, source ACs, seams, named tests, and derived design for full plans.
- [ ] #4 Plan reviews check architecture-record usefulness and `Architecture Context` when architecture is declared.
- [ ] #5 Plan reviews check abstract Quality Contract ladder conformance without expecting concrete tool names or commands.
- [ ] #6 The prompt preserves plan-review scope and does not require artifact findings for work where the artifact contract is not in scope.
<!-- AC:END -->
