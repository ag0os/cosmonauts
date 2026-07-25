---
id: TASK-486
title: Stage 3 — Make detached abort use live launch state
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-484
  - TASK-485
createdAt: '2026-07-22T15:51:33.209Z'
updatedAt: '2026-07-22T20:02:09.182Z'
---

## Description

Implementation stage 3. Owned behaviors: B-008, B-009, B-028 (source AC-004). Depends on stages 1 and 2 so abort reconciliation reuses the ledger and stamped-completion guard. Implement each race test-first and carry the exact behavior marker beside its executable test.

Own the mutable detached launch-state work in `lib/driver/driver.ts` and evidence in `tests/driver/driver.test.ts` and `tests/driver/driver-detached.test.ts`.

Ratified constraints: abort receives and re-reads one shared live state object, never by-value child/bridge/workdir snapshots. Race tests must be deterministic mocks, not sleeps or random stress. Termination and await precede guarded completion inspection and ledger reconciliation.

<!-- AC:BEGIN -->
- [x] #1 B-008 is proven by `tests/driver/driver.test.ts` > `terminates a detached child published during the pre-spawn abort window`: abort yields, re-reads live state, terminates and awaits the newly published child, and leaks no process, with the exact B-008 marker near the test.
- [x] #2 B-009 is proven by `tests/driver/driver-detached.test.ts` > `keeps pre-spawn abort and resume to one terminal attempt`: parent, child, settle, and fresh resume share one attempt ledger and produce at most one terminal with no duplicate outcome pair, with the exact B-009 marker near the test.
- [x] #3 B-028 is proven by `tests/driver/driver.test.ts` > `stops a bridge published during the abort window`: an abort between child and bridge publication prevents publication or immediately stops the bridge, skips post-abort pid/bridge setup, and leaves no watcher or timer, with the exact B-028 marker near the test.
- [x] #4 `lib/driver/driver.ts` owns one live `DetachedLaunchState` including child, bridge, workdir-created state, and an aborted flag; abort sets cancellation before yielding and re-reads the entire object after the yield.
- [x] #5 Spawn-window and child→bridge-window regressions use deterministic mocked publication seams with no production sleep or probabilistic stress loop; publishers honor an already-observed abort and cannot resurrect launch resources.
- [x] #6 Parent fallback inspection occurs only after any live child is terminated and awaited, then uses the shared stamped-completion guard and two-phase ledger without changing terminal ordering or gate-OFF behavior.
- [x] #7 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass with no leaked process, watcher, timer, pid file, ledger, or changed OFF-state output.
<!-- AC:END -->
