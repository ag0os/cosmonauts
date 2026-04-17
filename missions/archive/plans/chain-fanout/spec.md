# Chain DSL Parallel Steps — Specification

## Syntax Grammar

```ebnf
chain      = step ( "->" step )* ;
step       = parallel-group | fanout | stage ;
parallel-group = "[" stage ( "," stage )* "]" ;
fanout     = role "[" count "]" ;
stage      = qualified-name | name ;
count      = integer ;
```

A valid chain may therefore be a **single step**. `reviewer[2]` and `[planner, reviewer]` are complete chain expressions and must be accepted anywhere raw chain DSL is accepted.

## Validation Rules

- `count` must be an integer in the inclusive range `1..10`.
- Empty steps, empty group members, nested groups, and `fanout` inside a group are rejected.
- Known loop stages (for example `coordinator`, `tdd-coordinator`) are rejected inside any parallel step.
- Existing `role:count` syntax remains invalid.
- Stage names continue to be trimmed and lowercased.

## Examples

```text
# Existing sequential form (unchanged)
planner -> task-manager -> coordinator

# Single-step parallel group
[planner, reviewer]

# Single-step fan-out
reviewer[2]

# Multi-step parallel chain
planner -> [task-manager, reviewer] -> coordinator
```

`worker[3]` is intentionally not used in examples. Fan-out duplicates the same stage prompt three times; it does not assign three different tasks.

## Data Model

```ts
interface ChainStage {
  name: string;
  loop: boolean;
  completionCheck?: (projectRoot: string) => Promise<boolean>;
  prompt?: string;
}

interface ParallelGroupStep {
  kind: "parallel";
  stages: readonly [ChainStage, ChainStage, ...ChainStage[]];
  syntax:
    | { kind: "group" }
    | { kind: "fanout"; role: string; count: number };
}

type ChainStep = ChainStage | ParallelGroupStep;
```

## Dispatch Semantics

- Raw chain DSL detection must be syntax-aware, not based only on the presence of `->`.
- Any complete chain expression — including a single stage, single fan-out step, single bracket group, or multi-step chain — is routed to `parseChain()`.
- Workflow-name resolution is only used when the input is **not** recognized as raw chain DSL.

## Execution Semantics

- The chain still executes **steps** sequentially.
- A sequential step behaves exactly as today.
- A parallel step starts all member stages concurrently.
- Parallel steps only allow one-shot members (`loop === false`).
- Member stages receive the same prompt-building logic they would receive when run sequentially.
- If the first chain step is parallel and the caller provided a user prompt, that prompt is appended to every member of the first step.

## Failure and Abort Semantics

- Parallel execution uses **all-settled** semantics, not true fail-fast cancellation.
- If any member fails, the parallel step fails after all started members settle.
- After a failed parallel step, the chain stops and later steps are not started.
- If the chain abort signal fires while a parallel step is running, no later steps are started, but already-started members are still awaited.
- The `chain_run` tool must forward its incoming abort signal to `runChain()` so these semantics apply in the extension/TUI path.

## Result Semantics

- `ChainResult.stageResults` remains a flat list of leaf `StageResult` objects.
- For sequential steps, one `StageResult` is appended.
- For parallel steps, one `StageResult` per member is appended in the order the members were declared in the DSL, not completion order.

## Event Semantics

```ts
{ type: "chain_start", steps: ChainStep[] }
{ type: "parallel_start", step: ParallelGroupStep, stepIndex: number }
{ type: "parallel_end", step: ParallelGroupStep, stepIndex: number, results: StageResult[], success: boolean, error?: string }
```

- Existing `stage_start`, `stage_end`, and `stage_stats` events still fire for each member stage.
- `parallel_start` is emitted before any member `stage_start` event.
- `parallel_end` is emitted after all member `stage_end` / `stage_stats` events have been emitted.
- Member event ordering inside the group is not guaranteed beyond those outer brackets.

## Stats Semantics

For a parallel step:
- `tokens`, `cost`, `turns`, and `toolCalls` are the sum of member stats.
- Group wall-clock duration is the maximum of member durations.
- Overall `ChainResult.totalDurationMs` remains the actual wall-clock runtime of the full chain.

## Documentation Semantics

The following user-visible instruction surfaces must be updated together so the feature is taught consistently:
- CLI help / `cli/main.ts`
- `README.md`
- `AGENTS.md`
- `domains/shared/capabilities/spawning.md`
- `docs/architecture/approach.md`

## Non-Goals

- No nested or recursive parallel syntax.
- No per-member prompts in the DSL.
- No automatic task partitioning, task claiming, or file-conflict avoidance for fan-out stages.
- No speculative spawner cancellation work beyond the current proven APIs.