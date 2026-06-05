---
id: TASK-378
title: 'Group B: Re-implement watch_events over normalized events with cursor parity'
status: To Do
priority: medium
labels:
  - backend
  - api
  - testing
  - 'plan:orchestration-surface-consolidation'
dependencies:
  - TASK-376
  - TASK-377
createdAt: '2026-06-05T21:57:29.007Z'
updatedAt: '2026-06-05T21:57:29.007Z'
---

## Description

Implementation Order T4 from plan orchestration-surface-consolidation.

Dependencies: T2, T3.
Behaviors: B-008, B-009.
Marker expectations: tests for owned planned behaviors carry @cosmo-behavior plan:orchestration-surface-consolidation#B-008 and #B-009 near the executable tests.

Group B starts only after Group A is green.

<!-- AC:BEGIN -->
- [ ] #1 Add generic `run_activity` event variant and controller summary support.
- [ ] #2 Drive emits one `run_activity` compatibility event carrying the original `DriverEvent` for every legacy Drive event, including diagnostics-only/advisory legacy events.
- [ ] #3 `graph-activity-only` mode preserves `run_activity` through `processDurableDriverEvent()` while continuing to filter duplicate canonical lifecycle events.
- [ ] #4 `watch_events` reads normalized events on the healthy path, filters `legacy_driver_event` activity, applies legacy event-count cursor semantics, and keeps response shape/summaries.
- [ ] #5 `watch_events` verifies normalized completeness before trusting reconstruction: a count cross-check against the dual-written legacy JSONL plus a best-effort persisted `compat-degraded` marker (written to the run dir, not via the failing event store) trigger a legacy `events.jsonl` fallback with an explicit source/diagnostic; `run_status`/`run_watch` do not use the fallback.
- [ ] #6 Parity tests include cursor 0, non-zero `since`, one-to-many canonical normalization, advisory events, graph-backed Drive mode, total durable-append/setup failure fallback, and a **partial mid-run append-failure** case (some `run_activity` present, reconstruction count below legacy JSONL → divergence detected → legacy fallback).
<!-- AC:END -->
