---
id: TASK-303
title: watch_events returns event payloads in its text output
status: To Do
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - orchestration
dependencies: []
createdAt: '2026-05-12T19:34:14.859Z'
updatedAt: '2026-05-12T19:34:14.859Z'
---

## Description

watch_events only emits 'Read N driver event(s); cursor M' as model-visible content; the events are in details, which Pi does not surface to the model. Render up to K recent events as compact one-liners in the content text (type + key fields per event type), with a truncation note pointing at the since cursor for older events. Keep details unchanged; update the tool description.

<!-- AC:BEGIN -->
- [ ] #1 content text lists recent events as compact one-liners including task_blocked reason and driver_activity summary/toolName
- [ ] #2 Output is capped (max ~30 events, per-event length bounded); when truncated, a note gives the since value to fetch older events
- [ ] #3 details payload and the cursor semantics are unchanged (no parameter-schema change)
- [ ] #4 Tool description updated to state it returns event payloads
- [ ] #5 Regression test: a JSONL log with mixed event types renders block reason + activity summary in content; a since-paged second call returns only newer events
- [ ] #6 bun run test, lint, typecheck all pass
<!-- AC:END -->
