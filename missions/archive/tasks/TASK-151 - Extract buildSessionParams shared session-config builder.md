---
id: TASK-151
title: Extract buildSessionParams shared session-config builder
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:interactive-agent-switch'
dependencies: []
createdAt: '2026-04-08T14:41:14.549Z'
updatedAt: '2026-04-08T14:54:00.912Z'
---

## Description

Create `lib/agents/session-assembly.ts` with the `buildSessionParams()` function and `SessionParams` / `BuildSessionParamsOptions` interfaces, then refactor `cli/session.ts` and `lib/orchestration/session-factory.ts` to use it.

**New file:** `lib/agents/session-assembly.ts`

The builder accepts `BuildSessionParamsOptions` (def, cwd, domainsDir, resolver, runtimeContext, projectSkills, skillPaths, modelOverride, thinkingLevelOverride, extraExtensionPaths) and returns `SessionParams` (promptContent, tools, extensionPaths, skillsOverride, additionalSkillPaths, projectContext, model, thinkingLevel).

All of the following currently duplicated across both callers must move into the builder: prompt assembly via `assemblePrompts()`, `appendAgentIdentityMarker()`, `resolveTools()`, `resolveExtensionPaths()`, `buildSkillsOverride()`, model resolution, thinking level resolution. `extraExtensionPaths` must be appended to the resolved extension paths.

**Refactor `cli/session.ts:87-133`:** Replace inline assembly with a `buildSessionParams()` call. Caller retains: `appendSystemPrompt` resource loader option key, SessionManager construction, `createAgentSessionRuntime` call.

**Refactor `lib/orchestration/session-factory.ts:54-100`:** Replace inline assembly with a `buildSessionParams()` call. Caller retains: `systemPrompt` resource loader option key (one-line difference), `DefaultResourceLoader` instantiation, SessionManager construction, `createAgentSession` call.

**Behavior-preserving refactor only.** No new features. Full test suite must pass after.

<!-- AC:BEGIN -->
- [ ] #1 lib/agents/session-assembly.ts exists and exports buildSessionParams(), SessionParams, and BuildSessionParamsOptions
- [ ] #2 buildSessionParams() encapsulates all of: assemblePrompts, appendAgentIdentityMarker, resolveTools, resolveExtensionPaths, buildSkillsOverride, model resolution, thinking level resolution
- [ ] #3 extraExtensionPaths in BuildSessionParamsOptions are appended to the resolved extension paths in SessionParams.extensionPaths
- [ ] #4 cli/session.ts assembly block (lines 87–133) is replaced with a buildSessionParams() call; caller retains appendSystemPrompt option key, SessionManager construction, createAgentSessionRuntime call
- [ ] #5 lib/orchestration/session-factory.ts assembly block (lines 54–100) is replaced with a buildSessionParams() call; caller retains systemPrompt option key, DefaultResourceLoader instantiation, SessionManager construction
- [ ] #6 bun run test and bun run typecheck pass with no regressions
<!-- AC:END -->

## Implementation Notes

Implementation was completed by the previous worker (committed in 9a65d1a). This session verified correctness, ran typecheck and tests, and fixed a pre-existing test failure in tests/domains/coding-agents.test.ts: plan-reviewer agent was added (d5ededa) without being registered in ALL_DEFINITIONS, breaking the subagent reference invariant check. Added planReviewer to the test array in 26e3bc1. All 1238 tests and typecheck now pass.
