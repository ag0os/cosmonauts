---
id: TASK-152
title: Create agent switch port (lib/interactive/agent-switch.ts)
status: Done
priority: high
assignee: worker
labels:
  - backend
  - testing
  - 'plan:interactive-agent-switch'
dependencies: []
createdAt: '2026-04-08T14:41:24.923Z'
updatedAt: '2026-04-08T14:43:40.224Z'
---

## Description

Create `lib/interactive/agent-switch.ts` — process-global shared state for pending agent switch requests — and its unit tests.

**New file:** `lib/interactive/agent-switch.ts`

Three exports:
- `setPendingSwitch(agentId: string): void` — write agent ID to global slot
- `consumePendingSwitch(): string | undefined` — read and clear the pending ID; returns undefined when empty
- `clearPendingSwitch(): void` — clear without reading (for cancellation/error cleanup)

Implementation: use `Symbol.for('cosmonauts:agent-switch')` as a key on `globalThis`. The stored value is a plain object `{ agentId: string } | undefined`. Typed wrapper functions keep the public API clean. No module-level singleton — all state lives on `globalThis` so both natively-loaded code and jiti-loaded extension code share the same slot.

**New test file:** `tests/interactive/agent-switch.test.ts`

Cover: set then consume returns the ID; consume when empty returns undefined; clear after set yields undefined on next consume; set-set-consume returns the last set value.

<!-- AC:BEGIN -->
- [ ] #1 lib/interactive/agent-switch.ts exists and exports setPendingSwitch, consumePendingSwitch, clearPendingSwitch
- [ ] #2 State is stored via Symbol.for('cosmonauts:agent-switch') on globalThis — no module-level variable
- [ ] #3 consumePendingSwitch() returns undefined when no switch is pending
- [ ] #4 consumePendingSwitch() returns the agent ID and clears the slot
- [ ] #5 clearPendingSwitch() clears the slot without returning the value
- [ ] #6 tests/interactive/agent-switch.test.ts covers all three functions and edge cases; bun run test passes
<!-- AC:END -->

## Implementation Notes

Created lib/interactive/agent-switch.ts with three exports (setPendingSwitch, consumePendingSwitch, clearPendingSwitch) backed by Symbol.for('cosmonauts:agent-switch') on globalThis. All state is on globalThis — no module-level variable. Tests in tests/interactive/agent-switch.test.ts cover all four cases specified. All lint, typecheck, and tests pass.
