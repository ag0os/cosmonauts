---
id: TASK-235
title: 'W3-01: Refactor lib/orchestration/chain-runner.ts runChain into phase helpers'
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies: []
createdAt: '2026-04-29T13:59:07.170Z'
updatedAt: '2026-04-29T15:52:29.068Z'
---

## Description

Refactor the `runChain(config)` function at `lib/orchestration/chain-runner.ts:319` into named phase helpers, removing the complexity suppression. Must land before W3-02 to avoid same-file conflicts.

**Suppression:** `lib/orchestration/chain-runner.ts:319`, `runChain(config)`.

**Current responsibilities:** initializes chain caps/timers/spawner/stats, emits chain lifecycle events, iterates sequential and parallel steps, computes remaining loop constraints, aggregates stage results/stats/errors, stops on abort/timeout/failure, disposes spawner, builds `ChainResult`, and emits `chain_end`.

**Target pattern:** phase split:
- `createChainExecutionState(config: ChainConfig): ChainExecutionState`
- `shouldStopBeforeStep(state, config): boolean`
- `runChainStep(step, stepIndex, config, spawner, state): Promise<ChainStepOutcome>`
- `recordChainStepOutcome(state, outcome): void`
- `finalizeChainResult(state, config, chainStart): ChainResult`

**Coverage status:** `existing-coverage-sufficient` — `tests/orchestration/chain-runner.test.ts:1036` covers sequential success, user prompt injection, failure stop, unknown role, chain events, abort, disposal, iteration budget, timeout, qualified chains, stats, and parallel groups.

**TDD note:** yes for pure stop/finalize helpers; no for full async runner.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/orchestration/chain-runner.ts:319`.
- Commit the change as a single commit: `W3-01: Refactor lib/orchestration/chain-runner.ts runChain`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-01

<!-- AC:BEGIN -->
- [ ] #1 Existing chain runner tests are green before refactor.
- [ ] #2 runChain delegates to phase helpers and remains the public API.
- [ ] #3 Suppression at lib/orchestration/chain-runner.ts:319 is removed.
- [ ] #4 Spawner disposal remains in a finally path.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
