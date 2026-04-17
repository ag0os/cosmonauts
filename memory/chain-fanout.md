---
source: archive
plan: chain-fanout
distilledAt: 2026-04-15T15:05:13Z
---

# Chain DSL Parallel Steps and Fan-Out Syntax

## What Was Built

Extended the chain DSL from a flat `stage -> stage` list to a step model that supports bracketed parallel groups (`[a, b]`) and single-role fan-out (`role[n]`) while keeping sequential chains backward compatible. The parser, runner, CLI dispatch, tool path, logger, TUI rendering, docs, and tests now all operate on shared `ChainStep` contracts, and the actual `chain_run` extension path now honors abort propagation. Parallel execution reports group-level events, preserves flat leaf-stage results for downstream consumers, and accounts for wall-clock duration correctly instead of summing member runtimes.

## Key Decisions

- **Added a parallel wrapper step instead of changing `ChainStage`.** `ChainStage` stayed the executable leaf, while `ParallelGroupStep` and `ChainStep` carry topology. That kept existing stage-level behavior and flat `stageResults` consumers intact.
- **Centralized DSL structure logic in `lib/orchestration/chain-steps.ts`.** Formatting, first-step prompt injection, type guards, and raw-DLS detection live in one helper module so parser, runner, CLI, logger, and TUI do not drift.
- **Made single-step expressions first-class CLI input.** Raw chain detection moved off the old `includes("->")` heuristic so `reviewer[2]` and `[planner, reviewer]` reach `parseChain()` instead of being misread as workflow names.
- **Used all-settled parallel semantics.** Parallel groups wait for already-started members to finish before failing because spawned sessions cannot be force-cancelled mid-prompt with the current spawner API.
- **Kept fan-out as topology only.** `role[n]` duplicates the same stage prompt N times; it does not shard tasks, assign unique work, or make `worker[n]` safe.
- **Counted parallel wall time by max member duration.** Tokens/cost/turns/tool calls still sum across members, but runtime reporting uses real group wall-clock behavior instead of inflating totals.

## Patterns Established

- **`ChainConfig` is step-based now.** New chain features should extend `ChainStep[]`, not reintroduce flat `stages` assumptions in parser, runner, tools, or tests.
- **Parallel topology is explicit and shallow.** Supported forms are bracket groups and fan-out only; nested groups, fan-out inside groups, and loop stages inside parallel steps are rejected at parse time.
- **User prompt injection happens at the first executable step.** If the first step is parallel, every member gets the same appended user prompt.
- **Rendering and logging use shared formatting.** CLI and TUI surfaces should call `formatChainSteps()` and consume `chain_start`, `parallel_start`, and `parallel_end` rather than hand-formatting DSL strings.
- **Workflow resolution is the fallback, not the default.** Inputs recognized by `isChainDslExpression()` are treated as raw DSL; only non-DSL inputs fall back to named workflow lookup.
- **Parallel test coverage is seam-specific.** Parser, runner, CLI dispatch, logger, TUI rendering, and extension-tool wiring each gained focused tests instead of relying on one broad integration test.

## Files Changed

- `lib/orchestration/types.ts` — introduced `ParallelGroupStep`, `ChainStep`, step-based `ChainConfig`, and parallel event contracts.
- `lib/orchestration/chain-steps.ts` — added the shared topology helpers for type guards, prompt injection, DSL detection, and DSL formatting.
- `lib/orchestration/chain-parser.ts` and `lib/orchestration/chain-runner.ts` — implemented bracket-aware parsing, fan-out expansion, parallel execution, abort threading, and corrected stats aggregation.
- `cli/main.ts` and `domains/shared/extensions/orchestration/chain-tool.ts` — routed single-step DSL correctly and passed abort signals through the actual tool execution path.
- `cli/chain-event-logger.ts` and `domains/shared/extensions/orchestration/rendering.ts` — rendered chain starts and parallel group lifecycle events from the shared formatter.
- `README.md`, `AGENTS.md`, `domains/shared/capabilities/spawning.md`, and `docs/architecture/approach.md` — documented bracket/fan-out syntax consistently and explicitly warned that fan-out does not shard work.
- `tests/orchestration/*`, `tests/cli/*`, and `tests/extensions/*` — locked parser grammar, runner semantics, CLI dispatch, logger output, TUI rendering, and tool-level abort forwarding.

## Gotchas & Lessons

- **Parallel failure is not fail-fast cancellation.** Once a group starts, sibling members are awaited even if one fails; the chain stops before the next step, but in-flight members still complete.
- **`stageResults` order and event order differ on purpose.** Member `stage_start`/`stage_end` events can interleave by completion order, while final flattened `stageResults` stay in DSL declaration order.
- **Single bare identifiers are treated as chain DSL.** The DSL detector intentionally accepts values like `planner`; named workflows must remain distinguishable by shape, so compound names like `plan-and-build` are resolved as workflows instead.
- **Tool-path abort wiring mattered as much as runner semantics.** Abort behavior was already testable inside `runChain()`, but it was not real for TUI/extension users until `chain_run` forwarded the incoming signal.
- **Fan-out examples must avoid implying task partitioning.** Using `reviewer[2]` in docs is deliberate; `worker[n]` would encourage unsafe duplicate task claims and conflicting writes.
