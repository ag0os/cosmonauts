---
id: COSMO-009
title: Define chain runner types
status: Done
priority: high
labels:
  - orchestration
dependencies: []
createdAt: '2026-02-09T19:08:50.810Z'
updatedAt: '2026-02-09T19:10:13.173Z'
---

## Description

Create lib/orchestration/types.ts with ChainStage, ChainConfig, ChainResult, AgentRole, and StageResult types.

<!-- AC:BEGIN -->
- [x] #1 ChainStage type with name, maxIterations, completionCheck fields
- [x] #2 ChainConfig type with stages, projectRoot, model config
- [x] #3 ChainResult and StageResult types for execution results
- [x] #4 AgentRole union type matching DESIGN.md roles
- [x] #5 All types exported, no runtime code
<!-- AC:END -->
