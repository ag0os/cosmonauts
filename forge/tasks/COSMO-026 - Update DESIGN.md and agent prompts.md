---
id: COSMO-026
title: Update DESIGN.md and agent prompts
status: To Do
priority: medium
labels:
  - forge
  - docs
  - plan:forge-lifecycle
dependencies:
  - COSMO-021
  - COSMO-023
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Update project documentation to reflect the forge lifecycle system: plans, archive, and memory.

DESIGN.md needs a new section covering the forge lifecycle (plan → tasks → implement → archive → distill). The existing Task System section should be updated to mention plan association via `plan:` labels. The roadmap should reflect that this work is complete.

Agent prompts (planner, task-manager) need updates so they understand plans: the planner should know it creates plan directories via `plan_create`, and the task-manager should know to associate tasks with plans via the `plan` parameter on `task_create`.

<!-- AC:BEGIN -->
- [ ] #1 DESIGN.md has a Forge Lifecycle section covering plans, archive, memory, and distillation
- [ ] #2 DESIGN.md Task System section updated to mention `plan:` label convention
- [ ] #3 DESIGN.md Architecture section updated with `forge/plans/`, `forge/archive/`, and `memory/` directories
- [ ] #4 Planner agent prompt updated to use `plan_create` tool and forge-plan skill
- [ ] #5 Task-manager agent prompt updated to use `plan` parameter on `task_create`
<!-- AC:END -->
