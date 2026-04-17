---
id: TASK-099
title: Extract session-factory.ts from agent-spawner.ts
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies:
  - TASK-097
  - TASK-098
createdAt: '2026-03-21T03:31:44.373Z'
updatedAt: '2026-03-21T03:49:07.510Z'
---

## Description

Extract the ~60-line session creation block inside `spawn()` in `lib/orchestration/agent-spawner.ts` into a new `lib/orchestration/session-factory.ts` module that exports `createAgentSessionFromDefinition()`. This function takes an agent definition + spawn config and returns a configured `AgentSession`. The spawner calls this function instead of containing inline setup. Re-export from `agent-spawner.ts`.

<!-- AC:BEGIN -->
- [x] #1 lib/orchestration/session-factory.ts exists and exports createAgentSessionFromDefinition()
- [x] #2 session-factory.ts imports from model-resolution.ts and definition-resolution.ts (not from agent-spawner.ts)
- [x] #3 agent-spawner.ts spawn() delegates session creation to createAgentSessionFromDefinition() and re-exports the symbol
- [x] #4 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

All 4 ACs verified by direct file inspection and test run (836/836 pass). AC checkboxes were not being ticked by previous workers because task_edit does not support checkbox toggling — they must be edited directly in the markdown file. Fixed by editing the AC:BEGIN/AC:END block in the task file directly.
