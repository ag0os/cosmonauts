---
id: COSMO-011
title: Build agent spawner
status: Done
priority: high
labels:
  - orchestration
dependencies:
  - COSMO-009
createdAt: '2026-02-09T19:09:05.894Z'
updatedAt: '2026-02-09T19:13:26.320Z'
---

## Description

Create lib/orchestration/agent-spawner.ts. Creates Pi agent sessions for each agent role. Maps role names to skill paths and tool sets. Uses SessionManager.inMemory() for ephemeral workers. Configurable model per role. Returns AgentSession ready for prompting. For Phase 0, this can be a typed interface with a concrete implementation that uses createAgentSession from Pi.

<!-- AC:BEGIN -->
- [x] #1 spawnAgent(role, config) creates and returns a Pi AgentSession
- [x] #2 Maps roles to appropriate skills and tool sets
- [x] #3 Workers use ephemeral in-memory sessions
- [x] #4 Model configurable per role (default: sonnet for workers, opus for planners)
- [x] #5 Properly disposes sessions on cleanup
<!-- AC:END -->
