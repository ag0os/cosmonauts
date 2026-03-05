---
id: COSMO-025
title: Forge plan creation skill
status: To Do
priority: medium
labels:
  - forge
  - skill
  - plan:forge-lifecycle
dependencies:
  - COSMO-021
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Create `skills/domains/forge-plan/SKILL.md` — a Pi skill that teaches agents how to create well-structured implementation plans using the forge plan system.

The skill should cover: when to create a plan vs work without one, how to choose a good slug, the plan.md format and sections (overview, approach, scope, risks), when to include a separate spec.md, how to scope plans appropriately, and how tasks will be generated from the plan via the `plan:` label convention.

This skill is loaded by the planner agent when creating plans as part of the `planner -> task-manager -> coordinator` chain.

<!-- AC:BEGIN -->
- [ ] #1 SKILL.md exists at `skills/domains/forge-plan/SKILL.md` with proper frontmatter (name, description)
- [ ] #2 Covers plan.md format: frontmatter fields, recommended sections (overview, approach, scope, risks)
- [ ] #3 Explains when to use spec.md (complex features where the idea document outlives the implementation plan)
- [ ] #4 Covers slug naming conventions and plan scoping guidance
- [ ] #5 Explains the plan-to-task flow: how tasks are generated from plans and linked via `plan:<slug>` labels
<!-- AC:END -->
