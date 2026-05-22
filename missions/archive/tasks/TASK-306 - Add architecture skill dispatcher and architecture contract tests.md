---
id: TASK-306
title: Add architecture skill dispatcher and architecture contract tests
status: Done
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies:
  - TASK-305
createdAt: '2026-05-21T21:30:44.486Z'
updatedAt: '2026-05-21T21:55:43.737Z'
---

## Description

Create the new architecture-record authoring skill after the shared `work-artifacts` references exist. Before editing any skill files, the worker must load `/skill:creating-skills`; for this new dispatcher, `references/foundations.md` and `references/evaluation.md` are required, and `references/architecture.md` should be used if the skill structure expands.

<!-- AC:BEGIN -->
- [ ] #1 B-009 and B-010 are covered by text-contract tests in `tests/prompts/architecture-skill.test.ts`, with matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 `domains/shared/skills/architecture/SKILL.md` is a thin dispatcher that routes architecture-record format details to `/skill:work-artifacts` architecture guidance.
- [ ] #3 Architecture guidance requires durable records under `missions/architecture/<slug>.md` with a Decision Log and Boundary Model, and states architecture-of-record content does not belong in `plan.md`.
- [ ] #4 The skill enforces the usefulness rule: create `architecture.md` only when it changes implementation or review through durable boundaries, dependency rules, or multi-plan decisions.
- [ ] #5 Plan guidance requires an `Architecture Context` section naming relevant decisions and boundary rules when a plan depends on a durable architecture record.
- [ ] #6 Architecture documentation distinguishes active authoritative architecture records from post-completion `memory/` knowledge.
<!-- AC:END -->
