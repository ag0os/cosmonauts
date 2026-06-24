---
id: TASK-411
title: >-
  Task-manager: encode minimal real dependencies so Drive can parallelize
  independent work
status: To Do
priority: low
labels:
  - prompts
  - orchestration
dependencies: []
createdAt: '2026-06-24T17:30:31.332Z'
updatedAt: '2026-06-24T17:30:31.332Z'
---

## Description

PROBLEM (observed): the task-manager decomposed a plan into a strictly LINEAR
dependency chain (each task depending on the previous one), forcing the Drive to
run fully sequentially even though several tasks (e.g., documentation) were
independent. This serialized a multi-hour run that could have parallelized.

WHERE (persona file — additive edits):
- `bundled/coding/prompts/task-manager.md`

WHAT TO DO:
Instruct the task-manager to encode ONLY TRUE dependencies — task B depends on
task A only if B genuinely needs A's output, file state, or runtime contract —
and to leave independent tasks dependency-free so the orchestrator can run them
in parallel. Explicitly warn against chaining tasks linearly by default. Provide
a short heuristic: shared file / shared contract / shared runtime-state =
real dependency; otherwise independent.

CONSTRAINTS: edits are ADDITIVE — preserve existing content, including sibling-task
additions to task-manager.md.


<!-- AC:BEGIN -->
- [ ] #1 task-manager.md instructs encoding only true dependencies and leaving independent tasks unblocked to enable parallel execution, with a brief heuristic for what counts as a real dependency.
- [ ] #2 All edits are additive and preserve existing persona content.
<!-- AC:END -->
