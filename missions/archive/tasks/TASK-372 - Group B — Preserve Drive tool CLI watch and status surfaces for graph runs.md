---
id: TASK-372
title: Group B — Preserve Drive tool CLI watch and status surfaces for graph runs
status: Done
priority: medium
labels:
  - 'group:b'
  - backend
  - api
  - cli
  - testing
  - drive
  - 'plan:durable-frontend-migration'
dependencies:
  - TASK-371
createdAt: '2026-06-04T20:48:46.093Z'
updatedAt: '2026-06-04T22:23:54.715Z'
---

## Description

Owns Group B Implementation Order step 12. Worker should implement B-018 and B-019 test-first, placing exact `@cosmo-behavior plan:durable-frontend-migration#B-###` markers near executable tests. Scope is `run_driver`, `watch_events`, `cosmonauts drive run/status/list`, completion files, and graph event-sink compatibility.

<!-- AC:BEGIN -->
- [x] #1 B-018 is proven by `tests/extensions/orchestration-driver-tool-graph.test.ts` > `preserves run_driver watch_events and avoids duplicate graph lifecycle events`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-018`.
- [x] #2 B-019 is proven by `tests/cli/drive/graph-run.test.ts` > `preserves drive run status list and completion files for graph runs`, with marker `@cosmo-behavior plan:durable-frontend-migration#B-019`.
- [x] #3 `run_driver` graph-backed responses still include `runId`, `planSlug`, `workdir`, and `eventLogPath`, and `watch_events` still pages legacy `events.jsonl` with the same cursor semantics and compact summaries.
- [x] #4 Graph-backed `cosmonauts drive run/status/list` preserves `run.completion.json`, `run.pid`, and `run.inline.json` based classifications and compatible status/list JSON shapes, including completed, blocked, finalization_failed, running, dead, and orphaned states.
- [x] #5 The Drive event sink supports `graph-activity-only` mode so `orchestration-events.jsonl` contains scheduler lifecycle events once and only non-duplicative backend/activity evidence from legacy Drive events.
- [x] #6 Project-native tests for touched Drive tool/CLI/event behavior pass, and project-native lint/typecheck gates remain green.
<!-- AC:END -->
