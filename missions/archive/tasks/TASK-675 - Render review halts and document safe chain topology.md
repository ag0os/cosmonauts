---
id: TASK-675
title: Render review halts and document safe chain topology
status: Done
priority: high
labels:
  - frontend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-674
createdAt: '2026-09-10T02:15:16.402Z'
updatedAt: '2026-09-10T19:28:08.871Z'
---

## Description

Implementation Order step 8. Owns behaviors B-011 and B-012 exclusively. Add the typed event's human-readable projections in `cli/chain-event-logger.ts` and `domains/shared/extensions/orchestration/rendering.ts`, with evidence in their existing test files, then update `docs/orchestration.md` with the approved operational contract.

Recorded ground: D-004, D-005, D-010, and the design's no-CLI-surface rule are derived and may change only through amend-on-record. The spec says CLI invocation is unchanged and requires a visible machine-readable halt; adding public flags/fields or weakening the halt is ratified-scope deviation and must stop and escalate.

<!-- AC:BEGIN -->
- [x] #1 B-011 is proven by `tests/cli/chain-event-logger.test.ts` > `renders an unaddressed review-round event with available identity`, carrying `@cosmo-behavior plan:chain-stage-context#B-011`: stderr names the halt and reason, includes available slug/round, remains defined without identity, and preserves all existing event strings.
- [x] #2 B-012 is proven by `tests/extensions/orchestration-rendering.test.ts` > `renders an unaddressed review-round halt in chain progress`, carrying `@cosmo-behavior plan:chain-stage-context#B-012`: progress says task decomposition was halted, includes available identity/reason, and remains defined when identity is absent.
- [x] #3 Both renderers consume the same typed `unaddressed_review_round` event contract produced by inline and durable paths without inventing renderer-local review state.
- [x] #4 `docs/orchestration.md` documents topology-derived revision purpose, the exact reviewer and revision terminal-report responsibilities, the strictly-earlier addressed-evidence task guard, safe sequential versus unsafe same-index topology, and correction-plus-rerun guidance.
- [x] #5 The existing CLI command/option surface, planner persona, external `/spec-to-backlog` flow, and unrelated output strings remain unchanged.
<!-- AC:END -->
