---
id: TASK-092
title: Event streaming from spawned agent sessions
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies:
  - TASK-090
createdAt: '2026-03-11T13:22:32.546Z'
updatedAt: '2026-03-11T13:56:50.400Z'
---

## Description

Add `session.subscribe()` to the spawner before `session.prompt()` to capture richer progress events from spawned agents. Forward selected events through a new `onEvent` callback on `SpawnConfig`.

Changes:
- `lib/orchestration/types.ts`: Add `onEvent?: (event: SpawnEvent) => void` to `SpawnConfig`. Define `SpawnEvent` type for forwarded events (turn_start/end, tool_execution_start/end, auto_compaction_start/end). Add new `ChainEvent` variants: `agent_turn` and `agent_tool_use`.
- `lib/orchestration/agent-spawner.ts`: Call `session.subscribe()` before `session.prompt()`. Map Pi session events to `SpawnEvent` and invoke `config.onEvent`. Call unsubscribe before `dispose()`.
- `lib/orchestration/chain-runner.ts`: In `runStage()`, wire `SpawnConfig.onEvent` to forward as `ChainEvent` variants (`agent_turn`, `agent_tool_use`) through the chain's `onEvent` callback.
- Tests: Verify subscription setup, event forwarding, and unsubscribe cleanup.

<!-- AC:BEGIN -->
- [ ] #1 session.subscribe() is called before session.prompt() in the spawner
- [ ] #2 SpawnConfig includes optional onEvent callback for receiving SpawnEvents
- [ ] #3 turn_start/end, tool_execution_start/end, and auto_compaction_start/end Pi events are forwarded
- [ ] #4 New ChainEvent variants agent_turn and agent_tool_use are defined and emitted through chain runner
- [ ] #5 Unsubscribe is called before session.dispose()
- [ ] #6 Tests verify event forwarding from session through spawner to chain runner
<!-- AC:END -->

## Implementation Notes

Implemented event streaming across three layers:\n\n1. **types.ts**: Added `SpawnEvent` type (turn_start/end, tool_execution_start/end, auto_compaction_start/end), `onEvent` callback on `SpawnConfig`, and two new `ChainEvent` variants (`agent_turn`, `agent_tool_use`).\n\n2. **agent-spawner.ts**: `session.subscribe()` called before `session.prompt()` when `onEvent` is provided. `mapSessionEvent()` filters and maps Pi's `AgentSessionEvent` to the leaner `SpawnEvent`. Unsubscribe is called in `finally` before `dispose()`. Listener errors are swallowed.\n\n3. **chain-runner.ts**: `createSpawnEventForwarder()` maps spawn events to chain events — turn/compaction events become `agent_turn`, tool events become `agent_tool_use`. Wired into both one-shot and loop spawn calls. Uses a `sessionIdRef` pattern since session ID is only known after spawn returns.\n\n4. **chain-event-logger.ts**: Updated exhaustive switch with formatting for the two new event types.\n\n5. **Tests**: 10 new tests covering subscribe ordering, unsubscribe cleanup, event forwarding for all 6 Pi event types, filtering of unrelated events, and chain-runner forwarding of agent_turn/agent_tool_use."
