---
id: TASK-167
title: >-
  Update chain-runner.ts: Step-based execution, parallel group runner, abort
  threading, and stats aggregation
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:chain-fanout'
dependencies:
  - TASK-163
  - TASK-164
createdAt: '2026-04-10T18:36:42.463Z'
updatedAt: '2026-04-10T19:06:54.163Z'
---

## Description

Rewrite the execution loop in `lib/orchestration/chain-runner.ts` to consume `ChainStep[]` and add a `runParallelGroup()` path alongside the existing sequential stage path.

**Runner changes:**
- Change the main loop from iterating `config.stages` to iterating `config.steps`.
- For each step: if it is a `ChainStage`, execute sequentially as today; if it is a `ParallelGroupStep`, call `runParallelGroup()`.
- `runParallelGroup()` starts all member stages concurrently, awaits `Promise.allSettled()`, and:
  - Emits `parallel_start` before launching members.
  - Emits `stage_start` / `stage_end` / `stage_stats` for each member (in completion order).
  - Emits `parallel_end` after all members have settled, with flattened results in declaration order and `success: false` + `error` if any member failed.
  - Appends member `StageResult`s to the flat `stageResults` array in declaration order.
  - Returns whether the group succeeded.
- If any parallel step fails, the chain does not start the next step.
- `chain_start` emits `steps: ChainStep[]` instead of `stages: ChainStage[]`.

**Stats aggregation for parallel groups:**
- Sum `tokens`, `cost`, `turns`, and `toolCalls` across members (same as sequential accumulation).
- Use the **maximum** member `durationMs` as the group's wall-clock contribution (not the sum), to reflect actual parallel execution time.
- `ChainResult.totalDurationMs` reflects actual wall-clock runtime of the full chain.

**Abort signal:**
- Accept the abort signal through `runChain()` and thread it through member spawner calls, consistent with existing abort semantics.

**Prompt injection:**
- Replace the current `injectUserPrompt` call site (which mutates only `stages[0]`) with the shared helper from `chain-steps.ts` that handles both sequential and parallel first steps.

<!-- AC:BEGIN -->
- [ ] #1 runChain iterates config.steps and dispatches to sequential or parallel paths based on step kind
- [ ] #2 Parallel group members are started concurrently and awaited with Promise.allSettled()
- [ ] #3 parallel_start is emitted before any member stage_start; parallel_end is emitted after all member events
- [ ] #4 stageResults is flat and members appear in declaration order regardless of completion order
- [ ] #5 If any parallel member fails, parallel_end carries success:false and the chain does not start subsequent steps
- [ ] #6 Parallel stats sum tokens/cost/turns/toolCalls but use max member duration for wall-clock contribution
- [ ] #7 runChain accepts and threads the abort signal into member spawner calls
- [ ] #8 injectUserPrompt from chain-steps.ts is used instead of the previous inline mutation
<!-- AC:END -->

## Implementation Notes

Implemented in commit 746eb00. All 8 ACs satisfied:

1. runChain now iterates config.steps with isParallelGroupStep() dispatch
2. runParallelGroup() uses Promise.allSettled() for concurrent member execution
3. parallel_start emitted before member stage_start; parallel_end after all settled
4. stageResults flat in declaration order via settled.entries() index ordering
5. Failure from any member: parallel_end carries success:false, chain breaks out
6. statsDurationMs tracks actual group wall-clock (Date.now() diff); buildChainStats accepts explicit totalDurationMs override
7. config.signal threads through runStage calls inside runParallelGroup
8. Re-exports injectUserPrompt from chain-steps.ts; local implementation removed

Also fixed callers: cli/main.ts and chain-tool.ts renamed stages→steps. The chain-tool.ts stages→steps rename is a prerequisite for TASK-168 (abort signal forwarding) — that task can build on it.

Pre-existing lint errors in chain-parser.ts and tests/cli/main.test.ts (from TASK-163) remain — not in scope."
