---
id: TASK-239
title: >-
  W3-05: Refactor lib/orchestration/chain-profiler.ts buildSummary into
  per-section renderers
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:59:53.617Z'
updatedAt: '2026-04-29T16:12:13.338Z'
---

## Description

Refactor the `buildSummary(entries, spans, pendingTools)` function at `lib/orchestration/chain-profiler.ts:337` into named per-section renderer helpers, removing the complexity suppression.

**Suppression:** `lib/orchestration/chain-profiler.ts:337`, `buildSummary(entries, spans, pendingTools)`.

**Current responsibilities:** builds chain overview, stage breakdown, parallel group breakdown and overlap ratio, slowest tools top 20, per-agent tool breakdown, and orphaned/incomplete tool calls in one report.

**Target pattern:** per-section renderers:
- `renderChainOverview(entries: readonly ProfileTraceEntry[]): string[]`
- `renderStageBreakdown(entries: readonly ProfileTraceEntry[]): string[]`
- `renderParallelBreakdown(entries: readonly ProfileTraceEntry[]): string[]`
- `renderSlowestTools(spans: readonly ToolSpan[]): string[]`
- `renderPerAgentToolBreakdown(spans: readonly ToolSpan[]): string[]`
- `renderPendingTools(pendingTools: ReadonlyMap<string, PendingTool>): string[]`

**Coverage status:** `add-characterization-tests` — existing `tests/orchestration/chain-profiler.test.ts:622` covers required sections, total duration, incomplete chain, top 20 tools, orphaned tools, per-agent breakdown; `tests/orchestration/chain-profiler.test.ts:405` covers parallel breakdown/scopes. Add pre-refactor tests for: stage breakdown rows with expected columns/values for typical multi-stage entries, the `(no stages recorded)` placeholder when no stage entries exist, slowest-tool `[error]` tags for errored tool spans, empty slowest-tool and empty per-agent placeholder rendering, and pending-tool lines including all expected fields.

**TDD note:** yes for per-section renderers.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/orchestration/chain-profiler.ts:337`.
- Commit the change as a single commit: `W3-05: Refactor lib/orchestration/chain-profiler.ts buildSummary`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-05

<!-- AC:BEGIN -->
- [ ] #1 Added profiler summary edge-case tests are green before refactor.
- [ ] #2 buildSummary composes section renderers without changing output text.
- [ ] #3 Suppression at lib/orchestration/chain-profiler.ts:337 is removed.
- [ ] #4 Parallel overlap ratio behavior is preserved.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
