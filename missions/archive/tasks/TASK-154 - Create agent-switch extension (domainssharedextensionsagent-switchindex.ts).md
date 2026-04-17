---
id: TASK-154
title: >-
  Create agent-switch extension
  (domains/shared/extensions/agent-switch/index.ts)
status: Done
priority: high
assignee: worker
labels:
  - frontend
  - backend
  - 'plan:interactive-agent-switch'
dependencies:
  - TASK-152
createdAt: '2026-04-08T14:41:55.401Z'
updatedAt: '2026-04-08T15:01:06.642Z'
---

## Description

Create a Pi extension that registers the `/agent` command and handles the full switch flow.

**New file:** `domains/shared/extensions/agent-switch/index.ts`

**Bootstrap pattern:** Mirror `domains/shared/extensions/orchestration/index.ts:9-36`. Bootstrap a `CosmonautsRuntime` cached in a `Map<string, Promise<CosmonautsRuntime>>` keyed by `cwd`. Use `resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..'))` to find framework root. Use the bootstrapped registry for validation only.

**`/agent` command — with arguments (e.g. `/agent planner`):**
1. Get the bootstrapped runtime's registry; call `registry.has(agentId)` (or attempt `registry.resolve()` catching). If invalid, call `ctx.ui.notify()` with an error and return — do NOT call `ctx.newSession()`.
2. Show a warning: "Starting a new session as \`<agentId>\`. Current conversation will not be preserved."
3. Call `setPendingSwitch(agentId)`.
4. Call `ctx.newSession()`. If result is `{ cancelled: true }` or throws, call `clearPendingSwitch()` and show error notification.

**`/agent` command — no arguments:** Show an interactive selector with all available agents (use `ctx.ui.select()` or equivalent Pi API).

**`getArgumentCompletions`:** Return agent IDs from the bootstrapped registry for tab-completion.

**`session_start` handler:** Read the agent ID from `extractAgentIdFromSystemPrompt(ctx.getSystemPrompt())` (from `lib/agents/runtime-identity.ts`). Show a status notification: "Switched to \`<agentId>\` (\<modelName\>)".

## Implementation Plan

All 8 ACs completed:
#1 ✅ File exists, exports default Pi extension function
#2 ✅ Bootstrap uses same cwd-keyed promise cache pattern as orchestration extension
#3 ✅ Valid agent ID: shows warning, calls setPendingSwitch, calls ctx.newSession()
#4 ✅ Invalid agent ID: shows error notification, returns early (no ctx.newSession() call)
#5 ✅ Cancelled/thrown newSession: clearPendingSwitch() + error notification
#6 ✅ No args: ctx.ui.select() with all registry agent IDs
#7 ✅ getArgumentCompletions returns agent IDs from bootstrapped registry
#8 ✅ session_start reads agentId from system prompt, shows status notification with model name

<!-- AC:BEGIN -->
- [ ] #1 domains/shared/extensions/agent-switch/index.ts exists and exports a default Pi extension function
- [ ] #2 The extension bootstraps CosmonautsRuntime using the same cwd-keyed promise cache pattern as the orchestration extension
- [ ] #3 The /agent command with a valid agent ID: shows a warning, calls setPendingSwitch, calls ctx.newSession()
- [ ] #4 The /agent command with an invalid agent ID: shows an error notification and does NOT call ctx.newSession() — current session remains intact
- [ ] #5 If ctx.newSession() is cancelled or throws, clearPendingSwitch() is called and an error notification is shown
- [ ] #6 The /agent command with no arguments shows an interactive agent selector
- [ ] #7 getArgumentCompletions returns agent IDs from the bootstrapped registry
- [ ] #8 The session_start handler reads the agent ID from the system prompt marker and shows a status notification with agent name and model
<!-- AC:END -->

## Implementation Notes

Created domains/shared/extensions/agent-switch/index.ts with full /agent command implementation:

- Bootstrap pattern mirrors orchestration extension exactly (cwd-keyed promise cache, discoverFrameworkBundledPackageDirs, CosmonautsRuntime.create)
- /agent <agentId>: validates via registry.has(), shows warning, calls setPendingSwitch, calls ctx.newSession(). Clears pending switch on cancel/error.
- /agent (no args): shows ctx.ui.select() with all agent IDs
- getArgumentCompletions: uses lastCwd (captured in session_start) to bootstrap runtime and return matching agent IDs
- session_start handler: extracts agent ID from system prompt via extractAgentIdFromSystemPrompt, shows "Switched to `{agentId}` ({modelName})" notification

TypeCheck: clean. Lint: clean on new file (5 pre-existing errors in other files, unrelated). Tests: pass.
