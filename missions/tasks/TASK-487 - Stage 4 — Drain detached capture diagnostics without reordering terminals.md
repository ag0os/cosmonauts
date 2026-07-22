---
id: TASK-487
title: Stage 4 — Drain detached capture diagnostics without reordering terminals
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-484
  - TASK-485
  - TASK-486
createdAt: '2026-07-22T15:52:00.341Z'
updatedAt: '2026-07-22T20:16:57.209Z'
---

## Description

Implementation stage 4. Owned behaviors: B-002, B-003, B-004, B-005, B-027 (source AC-002). Depends on stages 1–3. Implement test-first and place each exact behavior marker near its named executable test.

Own `lib/driver/event-stream.ts`, the drain lifecycle in `lib/driver/driver.ts`, the ordering evidence in `lib/driver/drive-graph-runner.ts`, and tests in `tests/driver/event-stream-bridge.test.ts`, `tests/driver/event-stream.test.ts`, `tests/driver/driver-detached.test.ts`, and `tests/driver/drive-on-graph-acceptance.test.ts`.

Ratified D-001 constraint: preserve terminal legacy event → observable completion → episode capture. A capture-before-terminal reorder was tried and reverted after a real happy-path ordering-regression failure. F-003 is fixed only by an enabled post-terminal JSONL→bus drain that forwards the exact capture-failure diagnostic.

<!-- AC:BEGIN -->
- [x] #1 B-002 is proven by `tests/driver/driver-detached.test.ts` > `bridges a post-terminal episode capture failure to the detached parent bus`: exactly one `episode_capture_failed` diagnostic reaches the owning live parent bus while legacy/durable evidence and the primary result remain intact, with the exact B-002 marker near the test.
- [x] #2 B-003 is proven by `tests/driver/event-stream-bridge.test.ts` > `drains only episode capture diagnostics after a terminal event`: file order is preserved, cursor progress continues, and every unrelated post-terminal event is suppressed, with the exact B-003 marker near the test.
- [x] #3 B-004 is proven by `tests/driver/driver-detached.test.ts` > `bounds post-terminal bridge drain when the child does not exit`: the enabled handle settles after the 2,000 ms bounded fallback, performs a final poll, closes all resources, and abort still hard-stops without draining, with the exact B-004 marker near the test.
- [x] #4 B-005 is proven by `tests/driver/drive-on-graph-acceptance.test.ts` > `emits the terminal legacy event before completion and captures afterward`: every completion-backed outcome retains terminal event → completion → capture/diagnostic ordering and the reverted reorder fails, with the exact B-005 marker near the test.
- [x] #5 B-027 is proven by `tests/driver/driver-detached.test.ts` > `stops a draining bridge when the detached result rejects`: caller `try/finally` shutdown handles resolve, reject, and launch-throw paths, while an independent bridge-owned drain deadline self-stops even without `finish()`; `stop()` and `finish()` are mutually idempotent, with the exact B-027 marker near the test.
- [x] #6 `lib/driver/event-stream.ts` exposes serialized, final-polling `finish()` behavior across active/draining/stopped states, and `tests/driver/event-stream.test.ts` plus the bridge suite prove watcher, interval, and deadline cleanup under fake timers.
- [x] #7 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass; gate-OFF or identity-incomplete bridges retain immediate terminal stop, current event bytes/order, and current result latency.
<!-- AC:END -->
