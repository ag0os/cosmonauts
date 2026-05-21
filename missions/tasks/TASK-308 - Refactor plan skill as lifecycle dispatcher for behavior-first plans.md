---
id: TASK-308
title: Refactor plan skill as lifecycle dispatcher for behavior-first plans
status: To Do
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
createdAt: '2026-05-21T21:30:57.022Z'
updatedAt: '2026-05-21T21:30:57.022Z'
---

## Description

Refactor `/skill:plan` after the shared artifact contract exists. Before editing any skill files, the worker must load `/skill:creating-skills`; for simple edits read `references/foundations.md` and `references/evaluation.md`, and if splitting into references also read `references/architecture.md`.

<!-- AC:BEGIN -->
- [ ] #1 B-004, B-002, and B-020 are covered by `tests/prompts/plan-skill.test.ts`, with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers where those behaviors are tested.
- [ ] #2 `domains/shared/skills/plan/SKILL.md` owns plan lifecycle, plan tools, readiness checks, and plan-to-task handoff while routing artifact shape, behavior spine, and gate rules to `/skill:work-artifacts`.
- [ ] #3 Full planned feature/refactor plans require `## Behaviors` entries with context/action/expected result, source `AC-###`, seam, test, and `@cosmo-behavior plan:<slug>#B-###` marker.
- [ ] #4 Plan readiness guidance rejects behaviors without named tests and markers, and treats the `Design` section as derived from behavior placement rather than authored independently.
- [ ] #5 The plan skill describes exactly the three artifacts `spec.md`, `plan.md`, and `architecture.md` without moving architecture-of-record content into `plan.md`.
- [ ] #6 Optional plan references such as lifecycle/readiness are directly linked from the dispatcher if introduced, with no deep reference chains.
<!-- AC:END -->
