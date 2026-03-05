---
id: COSMO-020
title: Plan library core
status: To Do
priority: high
labels:
  - forge
  - plan:forge-lifecycle
dependencies: []
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Build the plan infrastructure in `lib/plans/`. Plans are directories under `forge/plans/<slug>/` containing a required `plan.md` and optional `spec.md`. The plan.md has YAML frontmatter (title, status, createdAt, updatedAt) and free-form markdown body sections.

Create: plan types/interfaces, a PlanManager class with CRUD operations, and file system utilities for plan directories. The PlanManager should support creating a plan (directory + plan.md + optional spec.md), listing plans, reading a plan by slug, and getting a plan summary with associated task count (by filtering tasks with `plan:<slug>` label).

Follow the same module structure as `lib/tasks/`: separate files for types, file-system operations, and the manager class.

<!-- AC:BEGIN -->
- [ ] #1 Plan types defined: Plan interface (slug, title, status, dates, body), PlanStatus type (active | completed), PlanCreateInput, plan frontmatter schema
- [ ] #2 File system utilities: create plan directory, read/write plan.md, read spec.md, list plan directories, delete plan directory
- [ ] #3 PlanManager class: createPlan, getPlan, listPlans, updatePlan (status, title), deletePlan
- [ ] #4 PlanManager.getPlanSummary returns plan metadata + count of associated tasks (queries TaskManager by `plan:<slug>` label)
- [ ] #5 Plan.md parsed with gray-matter (same as tasks), body preserved as raw markdown
- [ ] #6 Tests cover all CRUD operations, file system edge cases, and plan-task association counting
<!-- AC:END -->
