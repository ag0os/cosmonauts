---
id: TASK-236
title: 'W3-02: Refactor lib/orchestration/chain-runner.ts runStage into phase helpers'
status: Done
priority: medium
labels:
  - 'wave:3'
  - 'area:orchestration'
  - 'plan:fallow-temp-exceptions-cleanup'
dependencies:
  - TASK-235
createdAt: '2026-04-29T13:59:17.571Z'
updatedAt: '2026-04-29T15:56:14.771Z'
---

## Description

Refactor the `runStage(stage, config, spawner, constraints)` function at `lib/orchestration/chain-runner.ts:508` into named phase helpers, removing the complexity suppression. Requires W3-01 to already be landed to avoid same-file conflicts.

**Suppression:** `lib/orchestration/chain-runner.ts:508`, `runStage(stage, config, spawner, constraints)`.

**Current responsibilities:** validates stage role, resolves model/thinking/prompt/planSlug, runs one-shot stages with event forwarding, runs loop stages with pre-checks/default completion, enforces iteration/deadline/abort caps, aggregates stats, emits errors, and maps exceptions to `StageResult`.

**Target pattern:** phase split:
- `prepareStageExecution(stage, config): StageExecutionContext | StageResult`
- `createStageSpawnConfig(context, onEvent): SpawnConfig`
- `runOneShotStage(context): Promise<StageResult>`
- `runLoopStage(context, constraints): Promise<StageResult>`
- `evaluateLoopState(stage, config): Promise<LoopState>`
- `buildLoopExitResult(context, loopState): StageResult`

**Coverage status:** `existing-coverage-sufficient` — `tests/orchestration/chain-runner.test.ts:170` covers one-shot success/failure/prompts/compaction/registry; `tests/orchestration/chain-runner.test.ts:393` covers loop completion/budget/abort/failure/default completion; `tests/orchestration/chain-runner.test.ts:763` covers event forwarding.

**TDD note:** yes for pure helper contracts; no for full async runner.

**Worker contract:**
- Run characterization tests green BEFORE any structural change. After refactor, re-run them — they must still be green.
- Run `fallow audit`, `bun run test`, `bun run lint`, `bun run typecheck` after the refactor — all must be green.
- Remove the `// fallow-ignore-next-line complexity` comment at `lib/orchestration/chain-runner.ts:508`.
- Commit the change as a single commit: `W3-02: Refactor lib/orchestration/chain-runner.ts runStage`.

**Plan:** missions/plans/fallow-temp-exceptions-cleanup/plan.md — section: Wave 3 / W3-02

<!-- AC:BEGIN -->
- [ ] #1 Existing runStage tests are green before refactor.
- [ ] #2 runStage delegates one-shot and loop paths to named helpers.
- [ ] #3 Suppression at lib/orchestration/chain-runner.ts:508 is removed.
- [ ] #4 W3-01 has already landed to avoid same-file conflicts.
- [ ] #5 Full verification gate is green.
<!-- AC:END -->
