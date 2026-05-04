---
id: TASK-258
title: 'Plan 1: Pi tools run_driver and watch_events + bus wiring'
status: To Do
priority: medium
labels:
  - backend
  - 'plan:driver-primitives'
dependencies:
  - TASK-254
  - TASK-257
createdAt: '2026-05-04T17:34:11.134Z'
updatedAt: '2026-05-04T18:25:57.795Z'
---

## Description

Create `domains/shared/extensions/orchestration/driver-tool.ts` and `watch-events-tool.ts`; extend `domains/shared/extensions/orchestration/index.ts`.

See **Implementation Order step 10**, **D-P1-7**, **D-P1-12**, **D-P1-13**, **D-P1-9**, **Bus event mapping**, **Integration seams**, QC-008, QC-012, QC-013 in `missions/plans/driver-primitives/plan.md`.

Cross-plan invariants:
- Pi tool registration shape: `pi.registerTool({ name, label, description, parameters: Type.Object(...), execute: async (_id, params, signal, onUpdate, ctx) => ... })` — matching `spawn-tool.ts:413` and `chain-tool.ts:40`. NOT `{ inputSchema, handler }`.
- `index.ts` must add TWO new subscriptions to `activityBus`: `"driver_activity"` AND `"driver_event"`. These are separate from and must NOT replace the existing `"spawn_activity"` subscription at line 105-126.
- `driver_activity`/`driver_event` bus events forwarded to `pi.sendMessage(deliverAs:"nextTurn")` filtered by `parentSessionId` matching the current Pi session.

<!-- AC:BEGIN -->
- [ ] #1 run_driver tool registered via pi.registerTool({ parameters: Type.Object(...), execute: ... }) — not {inputSchema, handler}.
- [ ] #2 run_driver constructs a Backend instance for the requested backend parameter and calls runInline; returns {runId, planSlug, workdir, eventLogPath} immediately (not after run completes).
- [ ] #3 Concurrent run_driver for the same planSlug returns {error:'active', activeRunId, activeAt} without starting a second loop.
- [ ] #4 watch_events({ planSlug, runId, since? }) resolves missions/sessions/<planSlug>/runs/<runId>/events.jsonl via tailEvents; returns {events, cursor}.
- [ ] #5 index.ts adds subscriptions to 'driver_activity' AND 'driver_event' on activityBus, separate from the existing 'spawn_activity' subscription (lines 105-126 must remain untouched).
- [ ] #6 Bus forwarding filters by parentSessionId: only events matching the current Pi session's parentSessionId are passed to pi.sendMessage(deliverAs:'nextTurn').
- [ ] #7 QC-001: no file under lib/driver/ imports from any domains/ directory (verify by reading import lines).
<!-- AC:END -->

## Implementation Notes

Reset from false Done to To Do. Provider failure during chain run on 2026-05-04 — openai-codex/gpt-5.5 returned empty responses; coordinator confabulated success. No implementation landed. Retry pending.
