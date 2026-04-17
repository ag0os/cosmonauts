---
id: TASK-156
title: Integration tests for agent switching
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:interactive-agent-switch'
dependencies:
  - TASK-155
createdAt: '2026-04-08T14:42:19.073Z'
updatedAt: '2026-04-08T15:37:52.625Z'
---

## Description

Write integration tests covering the end-to-end agent switch flow and edge cases from the Quality Contract.

**Test files:**
- `tests/agents/session-assembly.test.ts` — unit tests for `buildSessionParams()`: verifies prompt content assembly, tool resolution, extension path resolution, skill override wiring, model/thinkingLevel resolution, and `extraExtensionPaths` injection.
- `tests/extensions/agent-switch.test.ts` — integration tests for the extension command flow.

**`tests/extensions/agent-switch.test.ts` must cover (maps to QC-007 through QC-012):**
- QC-007: `/agent worker` with `domainContext: 'coding'` resolves via the main registry (factory path), not the extension's independently bootstrapped one. Unqualified IDs that exist in multiple domains resolve correctly with domainContext.
- QC-008: Invalid agent ID → `ctx.ui.notify()` called with error, `ctx.newSession()` NOT called.
- QC-009: After cosmo → planner switch, the new SessionManager is scoped to `piSessionDir(cwd)/planner`, not `piSessionDir(cwd)/cosmo`.
- QC-010: If `ctx.newSession()` throws or returns `{ cancelled: true }`, `clearPendingSwitch()` is called (port state is clean afterward).
- QC-011: The `createRuntime` factory switch path calls `buildSessionParams()` — no inline assembly duplication (structural/call-path test).
- QC-012: Unqualified agent ID that exists in multiple domains resolves using the passed `domainContext`, not an arbitrary default.

## Implementation Plan

"#1 ✅ tests/agents/session-assembly.test.ts covers: prompt assembly, tool resolution, extension paths, skill overrides, model resolution, and extraExtensionPaths injection into SessionParams.extensionPaths\n#2 ✅ tests/extensions/agent-switch.test.ts covers invalid ID rejection (no ctx.newSession call)\n#3 ✅ tests/extensions/agent-switch.test.ts covers cancellation cleanup (clearPendingSwitch called after newSession cancellation)\n#4 ✅ tests/extensions/agent-switch.test.ts covers session directory scoping (new agent\'s directory, not old agent\'s)\n#5 ✅ tests/extensions/agent-switch.test.ts covers domain-context-aware resolution (QC-007 and QC-012)\n#6 ✅ bun run test passes with all new tests green (1285 tests total)"

<!-- AC:BEGIN -->
- [ ] #1 tests/agents/session-assembly.test.ts covers: prompt assembly, tool resolution, extension paths, skill overrides, model resolution, and extraExtensionPaths injection into SessionParams.extensionPaths
- [ ] #2 tests/extensions/agent-switch.test.ts covers invalid ID rejection (no ctx.newSession call)
- [ ] #3 tests/extensions/agent-switch.test.ts covers cancellation cleanup (clearPendingSwitch called after newSession cancellation)
- [ ] #4 tests/extensions/agent-switch.test.ts covers session directory scoping (new agent's directory, not old agent's)
- [ ] #5 tests/extensions/agent-switch.test.ts covers domain-context-aware resolution (QC-007 and QC-012)
- [ ] #6 bun run test passes with all new tests green
<!-- AC:END -->

## Implementation Notes

Tests written manually after worker timeouts. Two test files created:\n\n- `tests/agents/session-assembly.test.ts` (24 tests): Covers prompt assembly with identity marker, capability layers, domain-qualified IDs, tool resolution for all tool sets, extension path resolution with extraExtensionPaths, skill overrides, additionalSkillPaths, model resolution with overrides, thinking level resolution, and projectContext passthrough.\n\n- `tests/extensions/agent-switch.test.ts` (11 tests): Covers /agent command registration, valid ID switch flow (setPendingSwitch + newSession), invalid ID rejection without newSession call (QC-008), cancellation cleanup on both cancelled and thrown results (QC-010), interactive selector with no args, session_start notification with agent ID and model, and argument completions.
