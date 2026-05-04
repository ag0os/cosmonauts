---
id: TASK-254
title: 'Plan 1: cosmonauts-subagent backend'
status: To Do
priority: medium
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-248
createdAt: '2026-05-04T17:33:14.198Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Implement `lib/driver/backends/cosmonauts-subagent.ts` and `tests/driver/backends/cosmonauts-subagent.test.ts`.

See **Implementation Order step 8**, **D-P1-17**, **D-P1-8**, **Key contracts > cosmonauts-subagent.ts**, **Integration seams**, QC-018 in `missions/plans/driver-primitives/plan.md`.

Cross-plan invariant: `spawner.spawn()` MUST pass the **full SpawnConfig** — `role`, `prompt`, `cwd`, `signal`, `planSlug`, `parentSessionId`, `runtimeContext: { mode: "sub-agent", taskId, parentRole: "driver" }`, `domainContext`, `projectSkills`, `skillPaths`, `onEvent`. Omitting `parentSessionId` skips lineage recording at `lib/orchestration/agent-spawner.ts:303`. Omitting `domainContext`/`projectSkills`/`skillPaths` breaks child runtime resolution.

QC-001: `lib/driver/` must NOT import from any `domains/` directory. `AgentSpawner` is injected via `deps`.

<!-- AC:BEGIN -->
- [ ] #1 createCosmonautsSubagentBackend(deps: CosmonautsSubagentBackendDeps): Backend is exported; Backend.name === 'cosmonauts-subagent'; capabilities.canCommit === true.
- [ ] #2 Backend.run() calls deps.spawner.spawn() forwarding all of: role, prompt, cwd, signal, planSlug, parentSessionId, runtimeContext:{mode:'sub-agent',taskId,parentRole:'driver'}, domainContext, projectSkills, skillPaths, onEvent.
- [ ] #3 onEvent callback maps incoming spawn events to DriverEvent entries of variant {type:'driver_activity'} carrying runId, parentSessionId, taskId from BackendInvocation.
- [ ] #4 stdout is derived from spawned agent's last assistant message via extractAssistantText (mirrors spawn-tool.ts:127).
- [ ] #5 lib/driver/backends/cosmonauts-subagent.ts has zero imports from any domains/ directory.
- [ ] #6 tests/driver/backends/cosmonauts-subagent.test.ts mocks AgentSpawner and asserts all SpawnConfig fields including planSlug, parentSessionId, runtimeContext.taskId, runtimeContext.parentRole='driver', domainContext, projectSkills, skillPaths, onEvent; bun run test passes.
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
