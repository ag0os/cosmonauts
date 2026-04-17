---
id: TASK-145
title: Conditional file-backed sessions in session-factory
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:session-lineage'
dependencies:
  - TASK-143
  - TASK-144
  - TASK-142
createdAt: '2026-04-07T19:04:39.505Z'
updatedAt: '2026-04-07T19:18:41.349Z'
---

## Description

Modify `session-factory.ts` to use `SessionManager.open(path)` instead of `SessionManager.inMemory()` when `SpawnConfig.planSlug` is present. This is the key persistence integration point.\n\n**Modified files:**\n- `lib/orchestration/session-factory.ts` — conditional file-backed vs in-memory session based on `config.planSlug`\n\n**Implementation:**\n- When `planSlug` is set: generate a UUID filename stem, construct path as `<sessionsDirForPlan(cwd, planSlug)>/<role>-<uuid>.jsonl`, call `SessionManager.open(path)`\n- When `planSlug` is absent: existing `SessionManager.inMemory()` behavior unchanged\n- Return the session file path (or undefined) alongside the session so the spawner can use it for the manifest record

<!-- AC:BEGIN -->
- [ ] #1 When planSlug is set in SpawnConfig, createAgentSessionFromDefinition uses SessionManager.open() with path missions/sessions/<planSlug>/<role>-<uuid>.jsonl
- [ ] #2 When planSlug is absent, session behavior is identical to current (SessionManager.inMemory()) — no files written (QC-005)
- [ ] #3 The function returns (or makes available) the session file path so the spawner can record it in the manifest
- [ ] #4 JSONL file exists on disk after a plan-linked spawn completes (QC-003)
<!-- AC:END -->

## Implementation Notes

Changed return type of `createAgentSessionFromDefinition` from `Promise<AgentSession>` to `Promise<SessionCreateResult>` (new interface with `session` and `sessionFilePath` fields). When `config.planSlug` is set, uses `SessionManager.open()` with path `missions/sessions/<planSlug>/<role>-<uuid>.jsonl`, creating the directory first. Both callers (agent-spawner.ts and spawn-tool.ts) updated to destructure `{ session }`. Test mocks updated to return the new shape. `SessionManager.open()` on a new path creates the JSONL file when the session first writes entries, satisfying AC#4.
