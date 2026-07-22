---
id: TASK-485
title: Stage 2 — Converge thrown settle and resume completion ownership
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:episodic-log-detached-hardening'
dependencies:
  - TASK-484
createdAt: '2026-07-22T15:51:20.207Z'
updatedAt: '2026-07-22T15:51:20.207Z'
---

## Description

Implementation stage 2. Owned behaviors: B-006, B-007, B-010 (sources AC-003, AC-004). Depends on the persisted ledger from stage 1. Implement test-first and place the exact behavior marker near every owned executable test.

Own the fallback-completion contract in `lib/driver/run-state.ts` and its callers in `cli/drive/subcommand.ts` and `domains/shared/extensions/orchestration/driver-tool.ts`, plus the stage evidence in `tests/driver/drive-on-graph-acceptance.test.ts`, `tests/cli/drive/graph-resume.test.ts`, `tests/driver/run-state.test.ts`, and `tests/extensions/orchestration-driver-tool.test.ts`.

Ratified constraints: all settle/resume writers consult the two-phase attempt ledger. Existing stamped completion bytes are authoritative. This stage must not change terminal legacy event → completion → episode ordering or the off-by-default gate.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is proven by `tests/driver/drive-on-graph-acceptance.test.ts` > `keeps a thrown attempt at one failed terminal when settle writes fallback completion`: settle preserves the single failed episode and cannot add an aborted episode or downgrade stamped completion, with the exact B-006 marker near the test.
- [ ] #2 B-007 is proven by `tests/cli/drive/graph-resume.test.ts` > `rehydrates the attempt ledger and skips a second terminal after thrown-exit resume`: a fresh process reconstructs ownership from disk without an in-memory terminal cache, with the exact B-007 marker near the test.
- [ ] #3 B-010 is proven by `tests/driver/run-state.test.ts` > `preserves stamped completion bytes against fallback writers`: CLI, driver-tool, and parent-abort fallbacks leave an existing completedAt-bearing file byte-identical and replace only absent or unstamped completion, with the exact B-010 marker near the test.
- [ ] #4 `lib/driver/run-state.ts` is the single shared completion-read and guarded-fallback owner, and fallback callers in `cli/drive/subcommand.ts` and `domains/shared/extensions/orchestration/driver-tool.ts` return the authoritative persisted result rather than implementing independent guards.
- [ ] #5 Successful driver-tool settlement no longer rewrites completion, while rejection and launch-failure paths retain guarded fallback behavior and preserve the established primary result and warning text.
- [ ] #6 The affected Vitest suites, `bun run lint`, and `bun run typecheck` pass; gate-OFF runs create no ledger artifact and retain current completion bytes and output.
<!-- AC:END -->
