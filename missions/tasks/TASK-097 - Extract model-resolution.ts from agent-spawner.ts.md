---
id: TASK-097
title: Extract model-resolution.ts from agent-spawner.ts
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:orchestration-refactor'
dependencies: []
createdAt: '2026-03-21T03:31:33.761Z'
updatedAt: '2026-03-21T03:34:50.518Z'
---

## Description

Move the model/thinking resolution functions out of `lib/orchestration/agent-spawner.ts` into a new focused module `lib/orchestration/model-resolution.ts`. Re-export everything from `agent-spawner.ts` so no external consumer breaks. Update `chain-runner.ts` to import directly from the new module.

<!-- AC:BEGIN -->
- [ ] #1 lib/orchestration/model-resolution.ts exists and contains getModelForRole(), getThinkingForRole(), resolveModel(), and FALLBACK_MODEL
- [ ] #2 agent-spawner.ts re-exports all four symbols from model-resolution.ts so existing import paths are unbroken
- [ ] #3 chain-runner.ts imports getModelForRole and getThinkingForRole from model-resolution.ts instead of agent-spawner.ts
- [ ] #4 All existing orchestration tests pass without modification
<!-- AC:END -->

## Implementation Notes

model-resolution.ts created with FALLBACK_MODEL, getModelForRole, getThinkingForRole, resolveModel. agent-spawner.ts was in an intermediate state from a previous refactoring (definition-resolution.ts already existed with inline duplicates). Rewrote agent-spawner.ts cleanly to import+re-export from both new modules. chain-runner.ts updated to import model functions directly from model-resolution.ts. All 153 orchestration tests pass.
