---
id: TASK-095
title: CLI cost rendering and documentation update
status: Done
priority: medium
assignee: worker
labels:
  - frontend
  - backend
  - 'plan:observability'
dependencies:
  - TASK-091
  - TASK-092
createdAt: '2026-03-11T13:23:06.089Z'
updatedAt: '2026-03-11T14:05:36.216Z'
---

## Description

Update the orchestration extension's CLI rendering to display a cost summary table after chain completion. Update `docs/pi-framework.md` with the full event catalog.

Changes:
- `domains/shared/extensions/orchestration/index.ts`: In the `chain_run` tool's result handling, render a cost summary table from `ChainStats` in the `chain_end` event. Show per-stage breakdown (stage name, tokens, cost, duration) and chain totals. Use the existing `renderResult` pattern.
- `docs/pi-framework.md`: Add complete Pi lifecycle event catalog documenting all ~25 events with payloads and when they fire. Document the new `stage_stats`, `agent_turn`, and `agent_tool_use` ChainEvent variants.

Cost data is ephemeral — printed in CLI output and included in chain events, no disk persistence.

<!-- AC:BEGIN -->
- [ ] #1 chain_run renderResult displays a cost summary table when ChainStats is present in the result
- [ ] #2 Cost table shows per-stage breakdown: stage name, total tokens, cost (USD), duration
- [ ] #3 Cost table shows chain totals row with aggregated values
- [ ] #4 docs/pi-framework.md includes full Pi lifecycle event catalog with all event types and payloads
- [ ] #5 docs/pi-framework.md documents new ChainEvent variants (stage_stats, agent_turn, agent_tool_use)
- [ ] #6 Cost rendering degrades gracefully when stats are unavailable (no errors, just omits table)
<!-- AC:END -->

## Implementation Notes

Implemented in commit 19b7557.\n\nCost rendering: Added `buildCostTable()` to `domains/shared/extensions/orchestration/index.ts`. Renders a formatted table with per-stage rows (name, tokens, cost USD, duration) and a totals row. Only shown when `!isPartial && details.result?.stats` is truthy — no errors when stats are absent.\n\nDocumentation: Replaced the summary lifecycle event table in `docs/pi-framework.md` with a full catalog of all ~25 Pi extension events grouped by category (Input & Agent, Turn & Message, Context & Provider, Tool Execution, Session Management, Resource & Model). Added a new 'Cosmonauts Chain Events' section documenting all 11 ChainEvent variants with payloads, plus detailed descriptions of `stage_stats`, `agent_turn`, `agent_tool_use`, and `ChainStats` types."
