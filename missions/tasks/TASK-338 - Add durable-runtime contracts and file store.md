---
id: TASK-338
title: Add durable-runtime contracts and file store
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:durable-run-store-events'
dependencies:
  - TASK-337
createdAt: '2026-06-03T21:57:41.867Z'
updatedAt: '2026-06-03T21:57:41.867Z'
---

## Description

Implementation Order step 2. Implement the generic durable-runtime contracts and file-backed store after compatibility characterization. Tests that own planned behaviors must carry markers like `@cosmo-behavior plan:durable-run-store-events#B-###` near the executable test and use the named tests from the plan.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is covered by `tests/durable-runtime/file-store.test.ts` > `creates an inspectable run layout and reloads run metadata`: `FileRunStore.createRun`, load, list, and status operations create and preserve the inspectable scoped run layout, run-owned paths, recent-run ordering, and persisted status behavior when no terminal normalized event exists.
- [ ] #2 B-002 is covered by `tests/durable-runtime/file-store.test.ts` > `continues event sequences after reopening the file store`: normalized event appends use monotonic per-run `seq` cursors with ISO timestamps and correct `runId`, preserve order across store recreation, and return the latest sequence number rather than JSONL line count.
- [ ] #3 B-003 is covered by `tests/durable-runtime/file-store.test.ts` > `persists step records and rejects path traversal identifiers`: valid step records persist under the scoped run directory and unsafe scope/run/step identifiers are rejected before any file outside the run directory can be created.
<!-- AC:END -->
