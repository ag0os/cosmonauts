---
id: TASK-310
title: Refactor TDD skill for planned behavior markers and direct fixes
status: Done
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
createdAt: '2026-05-21T21:31:10.908Z'
updatedAt: '2026-05-21T22:03:56.539Z'
---

## Description

Refactor `/skill:tdd` to resolve planned behavior references to the new behavior spine while keeping direct fixes lightweight. Before editing any skill files, the worker must load `/skill:creating-skills`; for simple edits read `references/foundations.md` and `references/evaluation.md`, and if splitting into references also read `references/architecture.md`.

<!-- AC:BEGIN -->
- [ ] #1 B-005, B-002, and B-020 are covered by `tests/prompts/tdd-skill.test.ts`, with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 `bundled/coding/coding/skills/tdd/SKILL.md` keeps ownership of red/green/refactor and characterization-test discipline while routing planned behavior marker details to `/skill:work-artifacts`.
- [ ] #3 When implementing a planned `B-###` behavior, guidance requires the matching `@cosmo-behavior plan:<slug>#B-###` marker near the executable test.
- [ ] #4 Direct fixes require a regression test first but do not require behavior IDs or markers unless tied to a plan.
- [ ] #5 The skill explains that a behavior's durable home is the test layer and archiving a plan does not remove the behavior's regression protection.
- [ ] #6 Optional TDD references are directly linked from the dispatcher if introduced, with no deep reference chains.
<!-- AC:END -->
