---
id: TASK-312
title: Update planner prompt for work-artifacts routing and behavior-first plans
status: To Do
priority: medium
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-307
  - TASK-308
createdAt: '2026-05-21T21:31:22.012Z'
updatedAt: '2026-05-21T21:31:22.012Z'
---

## Description

Update the planner prompt to use `work-artifacts` for artifact shape and `/skill:plan` for lifecycle/readiness/tooling, preserving the behavior marker contract in full plans.

<!-- AC:BEGIN -->
- [ ] #1 B-012 is covered by `tests/prompts/planner.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-012` marker near the executable test.
- [ ] #2 `bundled/coding/coding/prompts/planner.md` routes artifact formatting, behavior spine, and gate ladder rules to `work-artifacts`.
- [ ] #3 The prompt routes plan lifecycle, readiness, plan tool usage, and plan-to-task handoff to `/skill:plan`.
- [ ] #4 Full planned feature/refactor plan guidance requires behavior IDs, source ACs, seams, named tests, and `@cosmo-behavior plan:<slug>#B-###` markers.
- [ ] #5 The prompt keeps direct-fix guidance lightweight and does not force direct fixes through spec/plan/architecture ceremony.
<!-- AC:END -->
