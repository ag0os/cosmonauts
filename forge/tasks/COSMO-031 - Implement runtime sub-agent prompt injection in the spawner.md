---
id: COSMO-031
title: Implement runtime sub-agent prompt injection in the spawner
status: To Do
priority: high
labels:
  - forge
  - backend
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-027
  - COSMO-030
createdAt: '2026-02-26T20:57:47.281Z'
updatedAt: '2026-02-26T20:57:47.281Z'
---

## Description

Implement runtime layer injection in lib/orchestration/agent-spawner.ts. Add prompt template handling for prompts/runtime/sub-agent.md and append the rendered runtime context only for sub-agent mode while preserving static prompt ordering for all other invocations.

<!-- AC:BEGIN -->
- [ ] #1 prompts/runtime/sub-agent.md exists with placeholders for runtime context fields
- [ ] #2 Spawner appends rendered runtime sub-agent layer only when runtimeContext.mode is 'sub-agent'
- [ ] #3 Template rendering replaces placeholders with safe defaults and leaves no unresolved template tokens
- [ ] #4 Static prompt layering remains unchanged for top-level runs
- [ ] #5 Runtime layer is appended after static layers
<!-- AC:END -->
