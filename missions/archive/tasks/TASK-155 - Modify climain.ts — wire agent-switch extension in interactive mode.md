---
id: TASK-155
title: Modify cli/main.ts — wire agent-switch extension in interactive mode
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:interactive-agent-switch'
dependencies:
  - TASK-153
  - TASK-154
createdAt: '2026-04-08T14:42:04.731Z'
updatedAt: '2026-04-08T15:02:43.107Z'
---

## Description

In `cli/main.ts`, pass the agent-switch extension's absolute path and the runtime's registry/domainContext to `createSession` when starting the interactive REPL (section 5, currently ~lines 415–430).

**Changes:**
1. Resolve the agent-switch extension's absolute path: `join(domainsDir, 'shared', 'extensions', 'agent-switch')` (using `runtime.domainsDir` or equivalent). The path must be absolute.
2. Pass it to the interactive `createSession` call as `extraExtensionPaths: [agentSwitchExtPath]`.
3. Pass `agentRegistry: registry` and `domainContext` from the runtime to the same call.

No changes to the print mode (`--print`) or init mode `createSession` calls — those are non-interactive and do not need agent switching.

No changes to the `AgentDefinition` or any other logic. This is purely additive — passing three new optional fields to an existing function call.

<!-- AC:BEGIN -->
- [ ] #1 The interactive createSession call in cli/main.ts receives agentRegistry, domainContext, and extraExtensionPaths
- [ ] #2 extraExtensionPaths contains the absolute path to domains/shared/extensions/agent-switch
- [ ] #3 The --print and init mode createSession calls are unchanged
- [ ] #4 bun run typecheck passes
- [ ] #5 cosmonauts starts in interactive mode without errors; /agent appears as an available command
<!-- AC:END -->

## Implementation Notes

Added 4 lines to cli/main.ts: computed agentSwitchExtPath = join(domainsDir, 'shared', 'extensions', 'agent-switch') and passed agentRegistry, domainContext, extraExtensionPaths to the interactive createSession call only. Print and init mode calls are unchanged. createSession already accepted all three fields — this was purely additive wiring.
