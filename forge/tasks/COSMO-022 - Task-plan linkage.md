---
id: COSMO-022
title: Task-plan linkage
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

Add plan association to the task creation flow. The `task_create` Pi tool gets an optional `plan` parameter (string, the plan slug). When provided, the tool auto-adds a `plan:<slug>` label to the task's labels array.

Add validation to enforce that a task has at most one `plan:` prefixed label. This validation should run in `task_create` and `task_edit` tool handlers (or in TaskManager itself) — if a task already has a `plan:` label and the update would add a different one, reject with an error.

No changes to the Task interface or TaskManager core — this is purely a label convention enforced at the tool layer.

<!-- AC:BEGIN -->
- [ ] #1 `task_create` tool accepts optional `plan` parameter (string)
- [ ] #2 When `plan` is provided, `plan:<slug>` is automatically added to the task's labels
- [ ] #3 Validation rejects tasks with more than one `plan:` prefixed label
- [ ] #4 Validation runs on both task_create and task_edit
- [ ] #5 Existing tasks without plan labels continue to work unchanged
- [ ] #6 Tests cover plan label auto-addition, validation rejection, and backwards compatibility
<!-- AC:END -->
