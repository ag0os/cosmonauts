---
id: TASK-492
title: Stage 7b — Release plan locks at the terminal-persisted hook
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-489
  - TASK-491
createdAt: '2026-07-22T15:53:16.548Z'
updatedAt: '2026-07-22T15:53:16.548Z'
---

## Description

Implementation stage 7 hook integration. Owned behaviors: B-016, B-017, B-018, B-023, B-024 (sources AC-007, AC-003, AC-002). Depends on the atomic stages 1–5 checkpoint and retryable lock release. Implement test-first and put each exact marker near its named executable test.

Own the optional `TerminalPersistedHook` contract in `lib/driver/types.ts`; terminal-helper sequencing in `lib/driver/drive-graph-runner.ts`; inline/backstop wiring in `lib/driver/driver.ts`; child wiring in `lib/driver/run-step.ts`; caller completion ownership in `cli/drive/subcommand.ts` and `domains/shared/extensions/orchestration/driver-tool.ts`; and evidence in `tests/driver/drive-on-graph-acceptance.test.ts`, `tests/driver/run-step.test.ts`, `tests/driver/cross-plan-commit-lock.test.ts`, and `tests/cli/drive/run.test.ts`.

Ratified D-004/D-009 ordering: emit terminal legacy event → write completion → invoke `onTerminalPersisted` → capture episode. This order must not be changed; the earlier capture reorder was reverted after a real regression. Hook and backstop release failures are fail-soft, never reclassify the persisted terminal, and suppress capture if the lock may remain held.

<!-- AC:BEGIN -->
- [ ] #1 B-016 is proven across `lib/driver/drive-graph-runner.ts`, inline `lib/driver/driver.ts`, and CLI completion ownership by `tests/driver/drive-on-graph-acceptance.test.ts` > `invokes terminal-persisted hook after completion and before capture on every completion-backed outcome`: release completes before capture/reporting and no primary write follows, with the exact B-016 marker.
- [ ] #2 B-017 is proven at the compiled-child seam by `tests/driver/run-step.test.ts` > `releases the detached plan lock after completion and before episode capture`: capture sees no plan lock, redundant successful completion rewrite is absent, and thrown paths retain the contained `.finally` backstop, with the exact B-017 marker.
- [ ] #3 B-018 is proven across graph-runner, run-step, and repository commit locking by `tests/driver/cross-plan-commit-lock.test.ts` > `serializes driver-owned commits across detached runs in one repo`: all primary git/run/completion work precedes early release and cross-plan commit order remains unchanged, with the exact B-018 marker.
- [ ] #4 B-023 is proven across graph-runner, inline driver, and compiled child by `tests/driver/drive-on-graph-acceptance.test.ts` > `preserves the persisted terminal when onTerminalPersisted rejects`: rejection is reported non-fatally inside the terminal helper, capture is skipped, no broad catch or second terminal runs, and backstop failure cannot replace the result, with the exact B-023 marker.
- [ ] #5 B-024 is proven for CLI, `lib/driver/run-step.ts`, and `domains/shared/extensions/orchestration/driver-tool.ts` by `tests/cli/drive/run.test.ts` > `does not write successful completion after the graph terminal hook`: graph-runner is the sole successful completion writer and missing returned completion is a contract error rather than post-hook repair, with the exact B-024 marker.
- [ ] #6 `lib/driver/types.ts` adds only an optional shared terminal hook type—no result or spec field becomes required—and every completion-backed terminal preserves event → completion → hook → capture; only episode-store I/O and the exact capture-failure diagnostic may follow the hook.
- [ ] #7 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass with plan-lock release before episode/diagnostic I/O, retryable `.finally` backstops, unchanged gate-OFF bytes, and unchanged cross-plan serialization.
<!-- AC:END -->
