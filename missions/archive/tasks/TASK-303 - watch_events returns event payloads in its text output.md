---
id: TASK-303
title: watch_events returns event payloads in its text output
status: Done
priority: high
labels:
  - 'plan:drive-smoke-fixes'
  - orchestration
dependencies: []
createdAt: '2026-05-12T19:34:14.859Z'
updatedAt: '2026-05-12T19:52:41.145Z'
---

## Description

watch_events only emits 'Read N driver event(s); cursor M' as model-visible content; the events are in details, which Pi does not surface to the model. Render up to K recent events as compact one-liners in the content text (type + key fields per event type), with a truncation note pointing at the since cursor for older events. Keep details unchanged; update the tool description.

<!-- AC:BEGIN -->
- [x] #1 content text lists recent events as compact one-liners including task_blocked reason and driver_activity summary/toolName
- [x] #2 Output is capped (max ~30 events, per-event length bounded); when truncated, a note gives the since value to fetch older events
- [x] #3 details payload and the cursor semantics are unchanged (no parameter-schema change)
- [x] #4 Tool description updated to state it returns event payloads
- [x] #5 Regression test: a JSONL log with mixed event types renders block reason + activity summary in content; a since-paged second call returns only newer events
- [x] #6 bun run test, lint, typecheck all pass
<!-- AC:END -->

## Implementation Notes

watch-events-tool.ts: content text now renders up to 30 most-recent events as compact one-liners via new exported summarizeDriverEvent(event) helper (covers all DriverEvent types incl. task_blocked reason, driver_activity summary/toolName, preflight/verify status+command, commit_made short sha+subject, spawn_failed error/exitCode, run_completed summary, run_aborted reason); each line clipped to ~160 chars; overflow note prepended when >30 events; cursor line always last; details payload and since/cursor semantics unchanged; description updated to say it returns event payloads. Added tests/extensions/orchestration-watch-events.test.ts (3 tests: mixed-event rendering incl. block reason + activity summary + cursor; since-paging returns only newer events in details+content; 35-event cap with overflow note). Verified: bun run test (2 pre-existing failures in tests/driver/backends/ from a concurrent BackendInvocation.projectRoot refactor, unrelated; 2021 pass incl. new tests), typecheck (only pre-existing errors from that same concurrent refactor), biome check clean on changed files.
