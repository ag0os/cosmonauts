---
id: TASK-094
title: Observability extension
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:observability'
dependencies:
  - TASK-092
createdAt: '2026-03-11T13:22:53.131Z'
updatedAt: '2026-03-11T14:01:20.833Z'
---

## Description

Create a lightweight observability extension at `domains/shared/extensions/observability/index.ts` that wires up Pi lifecycle events for diagnostics and structured logging.

Changes:
- `domains/shared/extensions/observability/index.ts`: Export default extension function. Use `pi.on()` to handle `turn_start`, `turn_end`, `tool_call`, `tool_execution_end`, `session_shutdown`. Log structured entries via `pi.appendEntry("observability", ...)`.
- `domains/coding/agents/coordinator.ts`: Add `"observability"` to extensions array.
- `domains/coding/agents/cosmo.ts`: Add `"observability"` to extensions array.
- `tests/extensions/observability.test.ts`: Test that the extension registers handlers and produces expected log entries for each event type.

Follow existing extension pattern from `domains/shared/extensions/orchestration/index.ts`.

<!-- AC:BEGIN -->
- [ ] #1 Extension file exists at domains/shared/extensions/observability/index.ts with default export function
- [ ] #2 Extension registers handlers for turn_start, turn_end, tool_call, tool_execution_end, and session_shutdown events
- [ ] #3 Handlers produce structured log entries via pi.appendEntry
- [ ] #4 Coordinator agent definition includes "observability" in its extensions array
- [ ] #5 Cosmo agent definition includes "observability" in its extensions array
- [ ] #6 Test file at tests/extensions/observability.test.ts verifies handler registration and log output
<!-- AC:END -->

## Implementation Notes

All ACs met. Extension registers handlers for turn_start, turn_end, tool_call, tool_execution_end, and session_shutdown. Each handler logs structured data via pi.appendEntry('observability', ...). Added to coordinator and cosmo agent definitions. Updated existing coding-agents.test.ts to match new extensions arrays. All 823 tests pass, typecheck and lint clean.
