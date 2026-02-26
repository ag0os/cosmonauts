---
id: COSMO-021
title: Plan Pi extension tools
status: To Do
priority: high
labels:
  - forge
  - plan:forge-lifecycle
dependencies:
  - COSMO-020
createdAt: '2026-02-26T00:00:00.000Z'
updatedAt: '2026-02-26T00:00:00.000Z'
---

## Description

Register plan tools as a Pi extension in `extensions/plans/index.ts`. Three tools: `plan_create`, `plan_list`, `plan_view`. Wire each tool to PlanManager from `lib/plans/`. Follow the same pattern as `extensions/tasks/index.ts` — create a new PlanManager per tool call using `ctx.cwd`.

Update `package.json` `pi.extensions` array to include the new extension path.

<!-- AC:BEGIN -->
- [ ] #1 `plan_create` tool: takes slug, title, optional description, optional spec content. Creates plan directory and writes plan.md (and spec.md if provided). Returns created plan.
- [ ] #2 `plan_list` tool: takes optional status filter. Returns list of plans with title, status, and associated task count.
- [ ] #3 `plan_view` tool: takes slug. Returns full plan content (plan.md body + spec.md if exists) and summary of associated tasks.
- [ ] #4 Extension registered in `extensions/plans/index.ts` following existing extension patterns
- [ ] #5 Tests cover all three tools with mock/real PlanManager
<!-- AC:END -->
