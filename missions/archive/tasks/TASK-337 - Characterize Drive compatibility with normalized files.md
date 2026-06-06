---
id: TASK-337
title: Characterize Drive compatibility with normalized files
status: Done
priority: high
labels:
  - testing
  - api
  - 'plan:durable-run-store-events'
dependencies: []
createdAt: '2026-06-03T21:57:34.272Z'
updatedAt: '2026-06-03T22:22:03.842Z'
---

## Description

Implementation Order step 1. Add compatibility characterization around existing Drive status/list/resume/watch behavior when normalized runtime files are present. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named tests from the plan.

<!-- AC:BEGIN -->
- [x] #1 B-008 is covered by `tests/cli/drive/status.test.ts` > `ignores normalized runtime files when classifying drive status`: Drive status classification remains based on `run.completion.json`, then `run.pid`, then `run.inline.json`, and ignores normalized runtime files while preserving existing completed/blocked/aborted/finalization_failed/running/dead/orphaned classifications.
- [x] #2 B-009 is covered by `tests/cli/drive/list.test.ts` > `ignores normalized-only runtime directories when listing drive runs`: Drive list output remains based on legacy Drive state files and excludes normalized-only directories with only `run.json` or `orchestration-events.jsonl`.
- [x] #3 B-011 is covered by `tests/extensions/orchestration-watch-events.test.ts` > `reads legacy driver events when normalized events also exist`: existing `watch_events` reads only legacy `DriverEvent` lines, keeps line-count cursor semantics, and does not render normalized events in text or structured details.
<!-- AC:END -->

## Implementation Notes

acceptance criteria still unchecked: #1, #2, #3, #4
