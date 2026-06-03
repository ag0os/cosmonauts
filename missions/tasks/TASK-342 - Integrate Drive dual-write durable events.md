---
id: TASK-342
title: Integrate Drive dual-write durable events
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-341
createdAt: '2026-06-03T21:58:11.890Z'
updatedAt: '2026-06-03T22:21:27.662Z'
---

## Description

Implementation Order step 6. Compose Drive legacy event sinks with the durable normalized sink for inline, detached, and resume paths after the translator exists. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named tests from the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is covered by `tests/driver/driver-durable-dual-write.test.ts` > `writes normalized events alongside unchanged legacy driver events`: inline or detached Drive runs dual-write normalized envelopes to `orchestration-events.jsonl` and `run.json` while legacy `events.jsonl` remains parseable as the same `DriverEvent` shapes and `watch_events` keeps the same cursor/summary behavior.
- [ ] #2 B-007 is covered by `tests/driver/driver-durable-dual-write.test.ts` > `continues the drive run when normalized event append fails`: normalized append failures do not prevent legacy event write/publish, do not alter Drive task/run outcome, and produce diagnostics without becoming `EventLogWriteError`.
- [ ] #3 B-016 is covered by `tests/driver/driver-durable-dual-write.test.ts` > `reports normalized status and events from a drive-produced run record events path`: a fake-backend Drive run produces `run.json.eventsPath` pointing at `orchestration-events.jsonl`, `runWatch` pages those normalized envelopes by sequence, `runStatus` reports the terminal state from them, and legacy `events.jsonl` remains a `DriverEvent` stream.
- [ ] #4 B-017 is covered by `tests/driver/driver-durable-dual-write.test.ts` > `continues the drive run when run record creation fails before the first event`: durable run-record setup is lazy, occurs after the legacy sink accepts the event, reports setup failure as diagnostics, skips/disables the failed normalized write without throwing into Drive, and preserves unchanged legacy events and task/run outcome.
- [ ] #5 B-010 is covered by `tests/cli/drive/run.test.ts` > `resume uses legacy driver events while dual-writing normalized resume events`: Drive resume still reads legacy Drive events for completed/blocked task indices and finalization recovery, while any new resume finalization events are also normalized and missing normalized events never prevent resume.
<!-- AC:END -->
