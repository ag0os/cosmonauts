---
id: TASK-436
title: Keep CLI task create free of config churn
status: To Do
priority: medium
labels:
  - api
  - testing
  - 'plan:task-id-system'
dependencies:
  - TASK-435
createdAt: '2026-06-30T17:36:43.171Z'
updatedAt: '2026-06-30T17:36:43.171Z'
---

## Description

Ensure single and --from-file batch create paths (cli/tasks/commands/create.ts) report created task(s), write only task files under missions/tasks/, and never create or rewrite missions/tasks/config.json. The CLI adapter must contain no ID-allocation logic — it delegates to TaskManager.createTask. Owns B-010 — marker #B-010.

<!-- AC:BEGIN -->
- [ ] #1 B-010: single create writes the task file and leaves config.json byte-unchanged when present / uncreated when absent
- [ ] #2 B-010: --from-file batch create reports all created tasks and likewise never rewrites or creates config.json
- [ ] #3 the CLI create adapter contains no ID-allocation logic (delegates to TaskManager)
- [ ] #4 CLI create tests carry the #B-010 marker and pass
<!-- AC:END -->
