---
id: TASK-153
title: >-
  Modify cli/session.ts — agent registry, domain context, extra extensions, and
  switch-aware createRuntime factory
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:interactive-agent-switch'
dependencies:
  - TASK-151
  - TASK-152
createdAt: '2026-04-08T14:41:39.638Z'
updatedAt: '2026-04-08T14:58:09.901Z'
---

## Description

Extend `CreateSessionOptions` and the `createRuntime` factory in `cli/session.ts` to support mid-session agent switching.

**Extend `CreateSessionOptions`:**
```typescript
agentRegistry?: AgentRegistry;   // for resolving pending switch IDs
domainContext?: string;           // from --domain flag or runtime config
extraExtensionPaths?: string[];   // absolute paths always injected (e.g. agent-switch extension)
```

**Modify the `createRuntime` factory (currently ~lines 134–162):**
When `consumePendingSwitch()` returns an agent ID:
1. Resolve the ID via the closed-over `agentRegistry.resolve(agentId, domainContext)`. If `agentRegistry` is absent or resolution fails, fall through to the original definition and log a warning.
2. Call `buildSessionParams()` with the new definition, passing `extraExtensionPaths` so the agent-switch extension is always included.
3. Construct a new `SessionManager` scoped to the target agent's directory (`piSessionDir(cwd)/newAgentId`, or unscoped for "cosmo"), ignoring the `sm` parameter from `newSession()`.
4. Build resource loader options from `SessionParams` (using `appendSystemPrompt` key) and create the session.
5. Wrap the entire consume-resolve-build path in try/catch; on error call `clearPendingSwitch()` and rethrow.

When `consumePendingSwitch()` returns undefined, the factory continues unchanged with the original definition.

When the new options are absent (no registry, no domainContext), `consumePendingSwitch()` is still called but the result is ignored (factory proceeds with original def), keeping the API additive and non-breaking.

## Implementation Plan

AC #1: ✅ CreateSessionOptions has agentRegistry?, domainContext?, extraExtensionPaths?
AC #2: ✅ createRuntime factory calls consumePendingSwitch() on every invocation
AC #3: ✅ When pending ID found and registry present: resolves def, calls buildSessionParams with extraExtensionPaths, creates agent-scoped SessionManager, builds session
AC #4: ✅ New SessionManager scoped to piSessionDir(cwd)/newDef.id (unscoped for cosmo)
AC #5: ✅ catch block calls clearPendingSwitch() then rethrows
AC #6: ✅ When consumePendingSwitch() returns undefined, falls through to original path unchanged
AC #7: ✅ bun run test (1238 tests) and bun run typecheck both pass

<!-- AC:BEGIN -->
- [ ] #1 CreateSessionOptions has three new optional fields: agentRegistry, domainContext, extraExtensionPaths
- [ ] #2 The createRuntime factory calls consumePendingSwitch() on every invocation
- [ ] #3 When a pending agent ID is found and agentRegistry is present, the factory resolves the new definition, calls buildSessionParams() with extraExtensionPaths, creates an agent-scoped SessionManager for the new agent, and builds the session with the new parameters
- [ ] #4 The SessionManager created by the factory is scoped to the new agent's directory (piSessionDir(cwd)/newAgentId), not the old agent's directory
- [ ] #5 On any error during switch resolution, clearPendingSwitch() is called and the error is rethrown
- [ ] #6 When consumePendingSwitch() returns undefined, the factory behaves exactly as before (no regression)
- [ ] #7 bun run test and bun run typecheck pass
<!-- AC:END -->

## Implementation Notes

Added AgentRegistry and agent-switch imports to cli/session.ts. Extended CreateSessionOptions with agentRegistry, domainContext, and extraExtensionPaths. Modified the createRuntime factory to: (1) always call consumePendingSwitch(), (2) when a pending ID exists and agentRegistry is present, resolve the new definition, call buildSessionParams with extraExtensionPaths, create an agent-scoped SessionManager (piSessionDir(cwd)/newAgentId, or unscoped for cosmo), build new resource loader options, and create the session — all wrapped in try/catch that calls clearPendingSwitch() on error, (3) when registry is absent, log a warning and fall through to original path. All 1238 tests and typecheck pass. Committed as eff8dcc.
