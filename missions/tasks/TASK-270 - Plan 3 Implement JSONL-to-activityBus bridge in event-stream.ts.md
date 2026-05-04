---
id: TASK-270
title: 'Plan 3: Implement JSONL-to-activityBus bridge in event-stream.ts'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:external-backends-and-cli'
dependencies: []
createdAt: '2026-05-04T20:20:17.006Z'
updatedAt: '2026-05-04T20:20:17.006Z'
---

## Description

Implements Implementation Order step 6. Decision Log: D-P3-4. Quality Contract: QC-004.

Extend `lib/driver/event-stream.ts` with `bridgeJsonlToActivityBus`.

**Cross-plan invariant — P3-INV-11 (full spec):**
`bridgeJsonlToActivityBus(path, runId, parentSessionId, bus): { stop(): void }`:
- If file missing at call time: use `fs.watch` on parent directory until file appears (max 30s timeout — structured error if never created).
- Maintain `(cursor, trailingBuffer)`: on read tick (200ms or fs.watch event), read appended bytes, concat with buffer, split by `\n`; last fragment without trailing `\n` goes back into buffer.
- On parse error: log to stderr, leave cursor at line start (retry next tick). Do NOT advance cursor.
- Stop self automatically when `run_completed` or `run_aborted` observed.
- Returns `{ stop(): void }` — caller can also stop manually.

**Implementation requirements from D-P3-4:**
- Watch parent dir for "rename" events; resolve when file appears.
- On parse fail: log to stderr, leave cursor at line start (retry next tick).
- Auto-stop on terminal events.

<!-- AC:BEGIN -->
- [ ] #1 bridgeJsonlToActivityBus(path, runId, parentSessionId, bus) is exported from lib/driver/event-stream.ts and returns { stop(): void }.
- [ ] #2 If the target file does not exist at call time, the bridge watches the parent directory and begins tailing once the file appears; times out with a structured error after 30 seconds if the file never appears.
- [ ] #3 Partial-line reads are buffered; cursor never advances past a line that lacks a trailing newline.
- [ ] #4 On parse error, logs to stderr and retries the same line on the next tick without advancing the cursor.
- [ ] #5 Bridge calls stop() automatically and ceases publishing when run_completed or run_aborted is observed.
- [ ] #6 Tests in tests/driver/event-stream-bridge.test.ts exercise all four edge cases from QC-004: (a) missing initial file, (b) partial-line read, (c) parse error retry, (d) auto-stop on terminal event.
<!-- AC:END -->
