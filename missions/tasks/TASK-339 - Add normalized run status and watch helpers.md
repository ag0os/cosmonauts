---
id: TASK-339
title: Add normalized run status and watch helpers
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-338
createdAt: '2026-06-03T21:57:48.326Z'
updatedAt: '2026-06-03T22:37:09.136Z'
---

## Description

Implementation Order step 3. Implement read-only normalized controller helpers over the durable event stream after the store exists. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named tests from the plan.

<!-- AC:BEGIN -->
- [x] #1 B-012 is covered by `tests/durable-runtime/controller.test.ts` > `pages normalized events by sequence cursor and reports malformed lines`: `runWatch` returns only valid normalized events with `seq > sinceSeq`, honors limits, includes compact text and full structured envelopes, reports malformed JSONL lines as diagnostics, and returns the latest valid sequence cursor.
- [x] #2 B-013 is covered by `tests/durable-runtime/controller.test.ts` > `derives status from terminal events when run records disagree`: `runStatus` derives summaries from `RunRecord` plus normalized events ordered by `seq`, gives latest terminal run events precedence over stale record status, exposes disagreeing status sources, and surfaces Drive finalization evidence only from adjacent activity events or diagnostics without adding generic finalization fields/status.
<!-- AC:END -->

## Implementation Notes

acceptance criteria still unchecked: #1, #2
