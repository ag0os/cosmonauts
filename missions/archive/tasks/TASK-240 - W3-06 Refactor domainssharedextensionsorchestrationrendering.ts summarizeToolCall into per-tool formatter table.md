---
id: TASK-240
title: >-
  W3-06: Refactor domains/shared/extensions/orchestration/rendering.ts
  summarizeToolCall into per-tool formatter table
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T14:00:02.934Z'
updatedAt: '2026-04-29T16:15:18.256Z'
---

## Description

Refactor the `summarizeToolCall(toolName, args)` function at `domains/shared/extensions/orchestration/rendering.ts:43` into a per-tool formatter table, removing the complexity suppression.

**Suppression:** `domains/shared/extensions/orchestration/rendering.ts:43`, `summarizeToolCall(toolName, args)`.

**Current responsibilities:** summarizes read/write/edit by basename, bash command with truncation, grep pattern with truncation, spawn_agent role, and unknown tools.

**Target pattern:** per-tool renderer table:
```ts
type ToolCallSummaryFormatter = (args?: unknown) => string
const TOOL_SUMMARY_FORMATTERS: Record<string, ToolCallSummaryFormatter>
```
Plus per-tool helpers: `summarizePathToolCall(toolName, args)`, `summarizeBashToolCall(args)`, `summarizeGrepToolCall(args)`, `summarizeSpawnAgentToolCall(args)`.

**Coverage status:** `existing-coverage-sufficient` — `tests/extensions/orchestration-rendering.test.ts:6` covers path tools, missing args, bash/grep truncation, spawn_agent role/fallback, unknown tools, and chain progress integration.

**TDD note:** yes for per-tool formatters.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `domains/shared/extensions/orchestration/rendering.ts:43`.
- Commit the change as a single commit: `W3-06: Refactor rendering.ts summarizeToolCall`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-06

<!-- AC:BEGIN -->
- [ ] #1 Existing rendering tests are green before refactor.
- [ ] #2 Formatter table preserves all current summary strings.
- [ ] #3 Suppression at domains/shared/extensions/orchestration/rendering.ts:43 is removed.
- [ ] #4 chainEventToProgressLine behavior remains unchanged.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
