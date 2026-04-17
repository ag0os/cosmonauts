---
id: TASK-093
title: Compaction config for spawned sessions
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies: []
createdAt: '2026-03-11T13:22:42.742Z'
updatedAt: '2026-03-11T13:46:19.577Z'
---

## Description

Pass `SettingsManager.inMemory()` with compaction settings in the spawner's `createAgentSession` call. Each coordinator loop iteration creates a fresh ephemeral session, so context doesn't accumulate across iterations — compaction only matters if a single iteration overflows.

Changes:
- `lib/orchestration/types.ts`: Define `CompactionConfig` interface with `enabled` (boolean), optional `keepRecentTokens` (number). Add optional `compaction?: CompactionConfig` to `SpawnConfig` and `ChainConfig`.
- `lib/orchestration/agent-spawner.ts`: When `config.compaction` is provided, pass `SettingsManager.inMemory({ compaction: { enabled: true } })` (or configured values) to `createAgentSession` instead of bare `SessionManager.inMemory()`.
- `lib/orchestration/chain-runner.ts`: Forward `ChainConfig.compaction` to `SpawnConfig` in `runStage()`.
- Tests: Verify compaction config is passed through to session creation.

<!-- AC:BEGIN -->
- [ ] #1 CompactionConfig interface exists in types.ts with enabled boolean and optional keepRecentTokens
- [ ] #2 SpawnConfig and ChainConfig both include optional compaction field
- [ ] #3 Spawner passes SettingsManager.inMemory() with compaction settings when compaction config is provided
- [ ] #4 Chain runner forwards ChainConfig.compaction to SpawnConfig in runStage()
- [ ] #5 Default behavior (no compaction config) remains unchanged — uses SessionManager.inMemory() as before
- [ ] #6 Tests verify compaction config propagation from chain config through spawner to session creation
<!-- AC:END -->

## Implementation Notes

AC #1: CompactionConfig interface added to types.ts with `enabled` boolean and optional `keepRecentTokens`.\nAC #2: Both SpawnConfig and ChainConfig have optional `compaction?: CompactionConfig` field.\nAC #3: agent-spawner.ts passes `SettingsManager.inMemory()` with compaction settings when config.compaction is provided.\nAC #4: chain-runner.ts forwards `config.compaction` to both one-shot and loop spawn calls.\nAC #5: When compaction is not set, no settingsManager is passed — same as before.\nAC #6: Tests in agent-spawner.spawn.test.ts verify settingsManager propagation; tests in chain-runner.test.ts verify forwarding from ChainConfig to SpawnConfig."
