---
id: TASK-488
title: Stage 5 — Reconcile terminal-only resumes with deterministic identity
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
  - TASK-487
createdAt: '2026-07-22T15:52:15.571Z'
updatedAt: '2026-07-22T20:28:34.040Z'
---

## Description

Implementation stage 5. Owned behaviors: B-011, B-012, B-013, B-025 (source AC-005). Depends on stages 1–4 and completes the implementation side of the atomic D-009 checkpoint. Implement test-first and place every exact behavior marker beside its named executable test.

Own deterministic identity work in `lib/driver/episode-identity.ts`, pre-`prepareResume()` reconciliation in `cli/drive/subcommand.ts`, live documentation in `docs/memory.md`, and evidence in `tests/cli/drive/graph-resume.test.ts` and `tests/memory/interface.test.ts`.

Ratified F-005 constraint: the synthetic attempt id is a namespaced SHA-256 derived solely from persisted run id, never random and never `randomUUID`. Ordinary new execution attempts keep their existing mint. Identity preparation is gate-ON and only for resumes that will terminate inside `prepareResume` (empty remaining tasks and no graph resume state).

<!-- AC:BEGIN -->
- [x] #1 B-011 is proven by `tests/cli/drive/graph-resume.test.ts` > `records one run-id-derived terminal for an off-then-enabled completed resume`: the resolved `episodeSource` and the deterministic run-id-derived `episodeAttemptId` are persisted **into `spec.json` via `writeDriverWorkdirInputs`** before the early return and before `persistResumeTerminal` — the test reads the on-disk `spec.json` and asserts both fields equal the values used for the recorded terminal — existing completedAt is preserved or stamped once, and exactly one terminal but no start episode is recorded, with the exact B-011 marker near the test.
- [x] #2 B-012 is proven by `tests/cli/drive/graph-resume.test.ts` > `repeats deterministic terminal-only resume without changing bytes or episode count`: a fresh repeat derives the identical id and leaves spec, completion, ledger count, and episode count byte-idempotent, with the exact B-012 marker near the test.
- [x] #3 B-013 is proven by `tests/memory/interface.test.ts` > `documents deterministic off-then-enabled terminal-only resume`: `docs/memory.md` adds the specified deterministic success/dedupe and honest warn/skip contract, qualifies the existing terminal-evidence claim, and preserves the launchDetached hard-kill and launch-resolution sentences, with the exact B-013 marker near the test.
- [x] #4 B-025 is proven by `tests/cli/drive/graph-resume.test.ts` > `warns and skips terminal capture when off-era resume source cannot resolve`: one bounded warning is emitted before the early return, no identity/marker/episode is created, and primary completion/result semantics remain unchanged, with the exact B-025 marker near the test.
- [x] #5 The pre-`prepareResume()` helper runs only when `remainingTaskIds` is empty and no graph resume state exists; refused dirty-worktree or unsupported-backend resumes leave `spec.json` and `task-queue.txt` byte-identical.
- [x] #6 `lib/driver/episode-identity.ts` uses a namespaced SHA-256 of persisted run id for the synthetic `attempt-...` token, contains no random source for F-005, and leaves the ordinary new-attempt mint unchanged; gate-OFF resume creates no runtime or new artifact.
- [x] #7 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass without changing the gate default or rewriting historical `memory/episodic-log.md`.
<!-- AC:END -->
