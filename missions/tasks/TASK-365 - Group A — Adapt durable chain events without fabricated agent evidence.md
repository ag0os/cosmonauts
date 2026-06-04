---
id: TASK-365
title: Group A — Adapt durable chain events without fabricated agent evidence
status: To Do
priority: medium
labels:
  - 'group:a'
  - backend
  - testing
  - chain
  - scheduler
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-364
createdAt: '2026-06-04T20:47:42.702Z'
updatedAt: '2026-06-04T20:47:42.702Z'
---

## Description

Owns Group A Implementation Order step 4. Worker should implement B-006 test-first and place `@cosmo-behavior plan:durable-frontend-migration#B-006` near the executable test. Scope is the chain scheduler backend evidence contract and normalized-to-ChainEvent adapter; existing ChainEvent consumers should continue to see the current progress UX.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is proven by `tests/orchestration/chain-event-adapter.test.ts` > `maps durable chain spawn evidence to ChainEvents and refuses to fabricate missing session ids`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-006`.
- [ ] #2 Durable chain runs produce adapted `chain_start`, `stage_start`, `parallel_start`, `stage_end`, `parallel_end`, `chain_end`, and `error` progress events from scheduler metadata compatible with existing ChainEvent consumers.
- [ ] #3 `agent_spawned`, `agent_completed`, `agent_turn`, and `agent_tool_use` ChainEvents are emitted only from persisted `step_tool_activity.details` evidence carrying role, Pi `sessionId`, and the required `SpawnEvent` payload.
- [ ] #4 Missing or malformed durable agent evidence produces no fabricated `agent_*` event and records a diagnostic/error path suitable for the negative proof.
- [ ] #5 Project-native tests for the touched chain event behavior pass, and project-native lint/typecheck gates remain green with chain-specific adapter/backend code kept out of `lib/durable-runtime/*`.
<!-- AC:END -->
