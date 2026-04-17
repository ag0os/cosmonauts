---
title: Chain DSL Parallel Steps and Fan-Out Syntax
status: active
createdAt: '2026-04-10T17:25:01.079Z'
updatedAt: '2026-04-10T17:59:32.079Z'
---

## Summary

Add parallel-step syntax to the chain DSL while preserving the existing sequential behavior and the DSL's "topology only" design. The revision introduces explicit `ChainStep` contracts, group-aware runner/events/rendering behavior, safe semantics for failure/stats/prompt injection, and the CLI/tool-path updates required to make single-step parallel expressions actually usable.

## Scope

**Included**
- Add named parallel groups (`[a, b]`) and fan-out (`role[n]`) to the chain DSL.
- Parse the new syntax into a first-class chain step model.
- Execute one-shot stages inside a parallel step concurrently.
- Emit/render group-aware events in the CLI and TUI.
- Preserve backward compatibility for plain sequential chains.
- Make raw DSL dispatch accept single-step parallel expressions such as `reviewer[2]` and `[planner, reviewer]`.
- Propagate cancellation signals through the `chain_run` tool path so documented abort semantics apply outside direct runner tests.
- Document the feature and its constraints in user-facing and agent-facing chain docs.

**Explicitly excluded**
- Nested parallel groups or fan-out inside bracket groups.
- Loop stages inside parallel steps.
- Mid-flight cancellation of already-started members after one member fails.
- Automatic work sharding or task assignment semantics for `role[n]`; fan-out duplicates the same stage prompt, it does not partition work.

**Assumptions**
- Current spawned sessions cannot be force-cancelled once `session.prompt()` is in progress, so group failure semantics must match that reality.
- Existing consumers of `ChainResult.stageResults` should continue to work without needing a parallel-specific result shape.

## Design

### Module structure

- `lib/orchestration/types.ts` — source of truth for chain contracts. Add `ParallelGroupStep`/`ChainStep`, update `ChainConfig` and `ChainEvent`, and keep `ChainStage` as the leaf executable unit.
- `lib/orchestration/chain-steps.ts` (new) — structural helpers shared across parser/runner/renderers/CLI dispatch: type guards, first-step traversal for prompt injection, DSL formatting, and raw-expression detection.
- `lib/orchestration/chain-parser.ts` — parse top-level steps with bracket awareness, expand fan-out into repeated leaf stages, and validate unsupported combinations.
- `lib/orchestration/chain-runner.ts` — execute `ChainStep[]` sequentially, run `ParallelGroupStep` members concurrently, aggregate stats correctly, and keep `ChainResult.stageResults` flattened by executable stage.
- `domains/shared/extensions/orchestration/chain-tool.ts` — consume `ChainStep[]`, inject the user prompt into the first step, and forward the tool-provided abort signal into `runChain()`.
- `cli/main.ts` — replace the current `includes("->")` raw-DLS heuristic with syntax-aware detection so one-step parallel expressions are routed into `parseChain()` instead of `resolveWorkflow()`.
- `cli/chain-event-logger.ts` and `domains/shared/extensions/orchestration/rendering.ts` — render chain/parallel events from the shared formatter so CLI and TUI output stay aligned.

### Dependency graph

- `types.ts` defines `ChainStage`, `ParallelGroupStep`, `ChainStep`, `ChainConfig`, and event/result contracts.
- `chain-steps.ts` depends on `types.ts` only.
- `chain-parser.ts` depends on `types.ts`, `chain-steps.ts`, and `AgentRegistry`.
- `chain-runner.ts` depends on `types.ts`, `chain-steps.ts`, the spawner, model resolution, and task/plan helpers.
- `cli/main.ts`, `chain-tool.ts`, CLI logger, and TUI rendering depend on `types.ts` plus `chain-steps.ts`; they must not each invent their own syntax detection or formatter.

### Key contracts

```ts
interface ParallelGroupStep {
  kind: "parallel";
  stages: readonly [ChainStage, ChainStage, ...ChainStage[]];
  syntax:
    | { kind: "group" }
    | { kind: "fanout"; role: string; count: number };
}

type ChainStep = ChainStage | ParallelGroupStep;
```

`ChainConfig` becomes:

```ts
interface ChainConfig {
  steps: ChainStep[];
  // existing fields unchanged
}
```

`ChainResult` keeps compatibility for downstream summaries:

```ts
interface ChainResult {
  success: boolean;
  stageResults: StageResult[]; // flat leaf-stage results in declared order
  totalDurationMs: number;
  errors: string[];
  stats?: ChainStats;
}
```

Parallel groups are exposed through events, not a second public result tree:

```ts
type ChainEvent =
  | { type: "chain_start"; steps: ChainStep[] }
  | { type: "parallel_start"; step: ParallelGroupStep; stepIndex: number }
  | {
      type: "parallel_end";
      step: ParallelGroupStep;
      stepIndex: number;
      results: StageResult[];
      success: boolean;
      error?: string;
    }
  | { type: "stage_start"; stage: ChainStage; stepIndex: number }
  | { type: "stage_end"; stage: ChainStage; result: StageResult }
  | { type: "stage_stats"; stage: ChainStage; stats: SpawnStats }
  | ...;
```

Prompt injection is defined at the step boundary:

```ts
function injectUserPrompt(steps: ChainStep[], prompt?: string): void;
```

If the first step is sequential, inject into that single stage. If the first step is parallel, append the same user request to every member of that first step.

Syntax-aware raw DSL detection is centralized instead of using `includes("->")`:

```ts
function isChainDslExpression(expression: string): boolean;
```

This helper returns true for any valid chain-shaped input, including a single stage, a single fan-out step, a single bracket group, and multi-step `->` expressions. `cli/main.ts` uses it before falling back to workflow-name resolution.

### Integration seams

- `parseChain()` currently returns `ChainStage[]` and tokenizes with `trimmed.split("->")` (`lib/orchestration/chain-parser.ts:52-66`). The revised parser must preserve current lowercasing/empty-stage/colon validation while splitting only on top-level arrows.
- `injectUserPrompt()` currently mutates only `stages[0]` (`lib/orchestration/chain-runner.ts:121-129`). With `ChainStep[]`, it must target the first executable step and broadcast to all members when that step is parallel.
- `runChain()` currently emits `chain_start` with a flat stage array and iterates `for (const [i, stage] of config.stages.entries())` (`lib/orchestration/chain-runner.ts:330-355`). The new runner must iterate `config.steps`, preserve current behavior for plain stages, and add a `runParallelGroup()` path for one-shot groups only.
- Stats are currently additive across all dimensions: `addSpawnStats()` sums `durationMs` (`lib/orchestration/chain-runner.ts:267-277`) and `buildChainStats()` sums stage durations into `totalDurationMs` (`lib/orchestration/chain-runner.ts:284-299`). Parallel aggregation must sum tokens/cost/turns/toolCalls but use max member duration for the group's wall-clock contribution.
- The spawner only respects abort before starting (`lib/orchestration/agent-spawner.ts:100`) and then blocks in `session.prompt()` / completion delivery (`lib/orchestration/agent-spawner.ts:161-169`). Because there is no proven mid-flight cancellation seam, parallel execution must use `Promise.allSettled()` and the contract must be: wait for all started members, then fail the group if any failed.
- The `chain_run` tool currently receives `_signal` but does not pass it to `runChain()` (`domains/shared/extensions/orchestration/chain-tool.ts:68-116`). To make abort semantics real in the main extension path, the implementation must thread that signal through unchanged and add tests that exercise tool-level cancellation wiring.
- CLI workflow dispatch currently treats raw DSL as `options.workflow.includes("->")` (`cli/main.ts:353-357`). Without replacing that heuristic, valid one-step parallel expressions never reach `parseChain()`. The implementation must move to syntax-aware detection and cover that boundary in `tests/cli/main.test.ts` and/or integration tests around workflow resolution.
- CLI logging formats the chain start by mapping `ChainStage[]` (`cli/chain-event-logger.ts:25-35`) and TUI progress does the same (`domains/shared/extensions/orchestration/rendering.ts:79-81`). Both must switch to the shared `formatChainSteps()` helper so the same DSL string renders everywhere.
- `chain-tool.ts` builds its final summary from `result.stageResults.map((s) => s.stage.name)` (`domains/shared/extensions/orchestration/chain-tool.ts:122-126`), and extension tests mock `parseChain()` with flat arrays today (`tests/extensions/orchestration.test.ts:166,200,225,252,555,584`). Keeping `stageResults` flat avoids a larger integration break.
- The architecture doc describes the DSL as pure topology (`docs/architecture/approach.md:152`). The design preserves that: brackets and `role[n]` change topology only; they do not add per-stage options, loop counts, or sharding semantics.

### Seams for change

- `chain-steps.ts` isolates structural traversal/formatting/raw-expression detection so future syntax additions stay localized instead of being reimplemented in parser, CLI dispatch, and renderers.
- Fan-out semantics are intentionally limited to "duplicate this one-shot stage prompt N times." If the project later needs safe role-specific fan-out (for example task sharding), that should be introduced as explicit agent metadata or a separate orchestration feature rather than hard-coded heuristics in the runner.

## Approach

- Preserve the existing leaf `ChainStage` model and add `ParallelGroupStep` as a wrapper, rather than teaching every consumer that a stage can sometimes be parallel.
- Parse fan-out as syntax sugar for a `ParallelGroupStep` with repeated `ChainStage` leaves and preserved source metadata (`syntax.kind = "fanout"`) for formatting.
- Execute parallel members with `Promise.allSettled()` so the implementation matches the verified spawner behavior. The chain stops before the next step if any member failed, but already-started members are awaited instead of being falsely reported as cancelled.
- Keep `ChainResult.stageResults` flat and deterministic by storing group member results in declaration order, even though `stage_start`/`stage_end` events may arrive in completion order while the group is running.
- Add explicit `parallel_start` / `parallel_end` events for progress UIs; do not overload existing `stage_*` events with ambiguous pseudo-stages.
- Replace ad hoc CLI raw-chain detection with the same structural helper used by docs/rendering-aware code, so `reviewer[2]`, `[planner, reviewer]`, and `planner -> [task-manager, reviewer]` all follow the same dispatch path.
- Update examples/help/docs to use safe explanatory fan-out examples (for example `reviewer[2]`) and explicitly state that fan-out does not shard work across workers.

## Files to Change

- `lib/orchestration/types.ts` — add `ParallelGroupStep`/`ChainStep`, switch `ChainConfig` and `chain_start` to step-based contracts, add `parallel_*` events.
- `lib/orchestration/chain-steps.ts` — new shared helper module for `ChainStep` type guards, first-step traversal, DSL formatting, and raw-expression detection.
- `lib/orchestration/chain-parser.ts` — bracket-aware parser, fan-out expansion, count cap validation, and loop-in-parallel rejection.
- `lib/orchestration/chain-runner.ts` — step-based execution, parallel group runner, prompt injection update, correct duration aggregation, and deterministic flattened `stageResults`.
- `domains/shared/extensions/orchestration/chain-tool.ts` — consume `ChainStep[]`, forward `_signal` into `runChain()`, update prompt injection call sites, and update tool description/examples if needed.
- `domains/shared/extensions/orchestration/rendering.ts` — render `chain_start`, `parallel_start`, and `parallel_end` from shared helpers.
- `cli/chain-event-logger.ts` — render chain start and parallel events from shared helpers.
- `cli/main.ts` — replace raw-DLS detection, route single-step parallel expressions to `parseChain()`, and update CLI help/examples.
- `README.md` — document `[a, b]` and `role[n]` syntax plus the no-sharding caveat for fan-out.
- `AGENTS.md` — update chain examples/instructions so agent-facing guidance matches the new syntax.
- `domains/shared/capabilities/spawning.md` — update chain DSL examples and guidance used in agent prompts/skills.
- `docs/architecture/approach.md` — update the chain DSL description so the architecture note matches the new topology syntax.
- `tests/orchestration/chain-parser.test.ts` — add valid/invalid grammar cases, loop rejection, count cap, and top-level arrow parsing tests.
- `tests/orchestration/chain-runner.test.ts` — add concurrency behavior, event ordering, failure semantics, abort semantics, and duration/stats aggregation tests.
- `tests/cli/main.test.ts` — add dispatch tests showing single-step fan-out/group expressions are treated as raw DSL, not workflow names.
- `tests/cli/chain-event-logger.test.ts` — add chain-start formatting with steps and `parallel_*` event formatting tests.
- `tests/extensions/orchestration-rendering.test.ts` — add TUI progress rendering tests for step-based chain start and parallel events.
- `tests/extensions/orchestration.test.ts` — update `parseChain()` mocks/call expectations for `ChainStep[]` and add coverage that `chain_run` passes the tool abort signal to `runChain()`.

## Risks

- **Must fix** — Incorrect CLI raw-DLS dispatch would make valid one-step parallel expressions unusable from the main CLI entry point. **Blast radius:** `--workflow`/raw chain users, docs examples, and any automation invoking `reviewer[2]` or `[planner, reviewer]`. **Countermeasure:** central `isChainDslExpression()` helper plus CLI tests for single-step parallel inputs.
- **Must fix** — If `chain_run` continues to drop the tool abort signal, documented abort behavior will hold only in direct runner tests and not in the actual extension path. **Blast radius:** TUI/tool users cannot cancel long-running chains reliably, and spec/docs would be false. **Countermeasure:** pass `_signal` through `chain-tool.ts` and verify the call in extension tests.
- **Must fix** — Incorrect parallel duration accounting would overstate total runtime and cost-table totals. **Blast radius:** `chain_run` summaries, TUI cost tables, `chain_end` stats consumers, and tests that rely on wall-clock totals. **Countermeasure:** separate parallel stats aggregation that sums cost/tokens/turns/toolCalls but uses max member duration for group wall time.
- **Mitigated** — A failed member cannot currently cancel already-running siblings. **Blast radius:** users wait for the group to settle before seeing failure; no later chain step should start. **Countermeasure:** define/document all-settled failure semantics, emit `parallel_end`, and test that downstream steps do not begin after a failed group.
- **Mitigated** — Formatter/documentation drift would make the same chain appear differently across CLI, TUI, prompts, and docs. **Blast radius:** operator confusion, brittle tests, contradictory agent guidance. **Countermeasure:** shared formatter/detection helpers plus docs updates for every live chain instruction surface.
- **Mitigated** — Users may misread fan-out as automatic task sharding and attempt `worker[n]`. **Blast radius:** duplicate task claims or conflicting writes in user-authored chains. **Countermeasure:** docs/help/spec explicitly state that fan-out duplicates prompts only; built-in examples avoid worker fan-out.

## Quality Contract

- id: QC-001
  category: architecture
  criterion: "All chain parser/runner/rendering/CLI-dispatch entry points use the shared `ChainStep` contract and shared step helpers instead of re-encoding parallel-shape logic independently."
  verification: reviewer

- id: QC-002
  category: behavior
  criterion: "Parser rejects invalid parallel syntax, loop stages inside parallel steps, and fan-out counts above the configured cap with explicit error cases in the parser test suite."
  verification: verifier
  command: "bun run test -- tests/orchestration/chain-parser.test.ts"

- id: QC-003
  category: behavior
  criterion: "When any member of a parallel step fails, the runner waits for all started members to settle, emits `parallel_end`, records flattened member results, and does not start the next chain step."
  verification: verifier
  command: "bun run test -- tests/orchestration/chain-runner.test.ts"

- id: QC-004
  category: correctness
  criterion: "Parallel-group stats sum cost/tokens/turns/tool calls while using max member duration for wall-clock accounting in chain totals."
  verification: verifier
  command: "bun run test -- tests/orchestration/chain-runner.test.ts"

- id: QC-005
  category: integration
  criterion: "Single-step expressions such as `reviewer[2]` and `[planner, reviewer]` are dispatched by `cli/main.ts` to `parseChain()` rather than treated as workflow names."
  verification: reviewer

- id: QC-006
  category: behavior
  criterion: "The `chain_run` tool forwards its abort signal into `runChain()` so documented abort behavior applies in the extension/TUI path, not only in direct runner tests."
  verification: reviewer

- id: QC-007
  category: integration
  criterion: "CLI logger, TUI progress rendering, README, `AGENTS.md`, and `domains/shared/capabilities/spawning.md` all render the same bracket/fan-out syntax and explicitly avoid presenting fan-out as worker-task sharding."
  verification: reviewer

## Implementation Order

1. **Define the step model and shared helpers** — update `types.ts`, add `chain-steps.ts`, and adjust prompt-injection/formatting/raw-expression-detection contracts first so parser, runner, CLI dispatch, and renderers build against one shared shape.
2. **Implement parsing and dispatch validation** — extend `chain-parser.ts` and `cli/main.ts` so bracket groups, fan-out expressions, and single-step raw DSL inputs are all recognized and validated consistently.
3. **Implement runner and tool semantics** — update `chain-runner.ts` to consume `ChainStep[]`, execute parallel groups with all-settled semantics, emit new events, aggregate stats/durations correctly, and thread abort signals through `chain-tool.ts`.
4. **Update user-facing rendering and docs** — wire CLI/TUI/tool descriptions/help/docs/prompts to the shared formatter and add the fan-out caveat.
5. **Finish integration tests** — update logger/rendering/CLI/extension tests to the new contracts and verify raw-dispatch plus signal propagation through the actual entry points.
