---
id: TASK-484
title: Stage 1 — Persist the two-phase attempt-terminal ledger
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies: []
createdAt: '2026-07-22T15:50:58.664Z'
updatedAt: '2026-07-22T15:50:58.664Z'
---

## Description

Implementation stage 1. Owned behaviors: B-022, B-026 (sources AC-003, AC-004, AC-005). Implement test-first, one behavior at a time, and place each exact `@cosmo-behavior plan:episodic-log-detached-hardening#B-###` marker near its executable Vitest test.

Own `lib/driver/run-state.ts`, the ledger integration in `lib/driver/drive-graph-runner.ts`, `tests/driver/run-state.test.ts`, and `tests/driver/drive-on-graph-recovery.test.ts` for this stage. Run-state remains the filesystem-state owner; episode logic depends on it, never the reverse.

Ratified constraints: the ledger is two-phase. Persist `(attemptId, outcome, exact timestamp, state="intended")` before `recordEpisode`, then rewrite the same record to `state="recorded"` only after successful capture. The thrown terminal path resolves its timestamp exactly once at intent time and passes it explicitly to `recordEpisode`; terminal capture must never get an implicit wall-clock timestamp. Preserve terminal legacy event → completion → capture ordering at this stage; F-003 is not fixed by reordering.

<!-- AC:BEGIN -->
- [ ] #1 B-022 is proven by `tests/driver/run-state.test.ts` > `marks an attempt only after successful terminal capture and permits retry after failure`: capture failure leaves an intended, retryable claim and warning; success atomically confirms it; later retries skip, with the exact B-022 marker near the test.
- [ ] #2 B-026 is proven by `tests/driver/drive-on-graph-recovery.test.ts` > `replays an intended terminal record instead of writing a second outcome`: fresh-process replay uses the persisted outcome and exact timestamp, dedupes byte-identically, and cannot create a failed-plus-aborted pair, with the exact B-026 marker near the test.
- [ ] #3 `lib/driver/run-state.ts` stores validated version-1 records at `run.terminal-episodes/<sha256(attemptId)>.json` with deterministic bytes; malformed or partial records read as absent, unsafe raw attempt IDs never become path segments, and the directory exists only for identity-bearing terminal paths.
- [ ] #4 Every terminal builder using `lib/driver/drive-graph-runner.ts` follows the two-phase intended→recorded protocol; a thrown terminal resolves one timestamp at intent time and passes it explicitly to episode recording, while a recorded claim skips capture and an intended claim blocks a divergent outcome.
- [ ] #5 Ledger read/write failures remain fail-soft through the established `episode_capture_failed` reporting path, and a failed intent write degrades to the current unclaimed capture behavior without changing the primary result.
- [ ] #6 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass without widening the MemoryStore, episode serializer, config loader, or architecture surfaces.
<!-- AC:END -->
