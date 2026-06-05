# Plan Review: orchestration-surface-consolidation

## Findings

- id: PR-001
  dimension: state-sync
  severity: high
  title: "`watch_events` fallback cannot detect partial normalized-event loss"
  plan_refs: plan.md:140, plan.md:419, plan.md:697
  code_refs: lib/driver/event-stream.ts:348, lib/driver/event-stream.ts:353, lib/driver/event-stream.ts:356, lib/driver/event-stream.ts:357, lib/driver/event-stream.ts:633
  description: |
    B-008 requires `watch_events` to fall back to the legacy Drive `events.jsonl` when durable setup/append fails after the legacy JSONL write, but the detailed design only falls back when the normalized run record/events are absent or contain no `run_activity` events at all. That condition misses the realistic current failure mode where one normalized append fails in the middle of a run.

    In the current sink, each normalized append failure is caught per event and only reported to stderr (`drive_durable_event_append_failed`); the failure is not persisted into the normalized stream, and later normalized appends may still succeed. A normalized stream with some `run_activity` events can therefore be missing legacy events that are present in the legacy JSONL. If the new mapper treats that partial stream as healthy, it silently drops events and returns an incorrect legacy cursor, breaking the existing `watch_events` compatibility contract.

    The plan needs an explicit detection rule for partial divergence, not just absent/no-activity fallback. The planner should require either a persisted compatibility diagnostic/index or a comparison against the legacy JSONL event count before the compatibility tool trusts normalized reconstruction.

- id: PR-002
  dimension: interface-fidelity
  severity: medium
  title: "No contract carries durable chain `runId` from `runDurableChain` to tools and CLI"
  plan_refs: plan.md:105, plan.md:110, plan.md:160, plan.md:424
  code_refs: lib/orchestration/durable-chain-runner.ts:57, lib/orchestration/durable-chain-runner.ts:70, lib/orchestration/durable-chain-runner.ts:138, lib/orchestration/durable-chain-runner.ts:142, lib/orchestration/types.ts:224, domains/shared/extensions/orchestration/chain-tool.ts:156, domains/shared/extensions/orchestration/chain-tool.ts:175
  description: |
    The plan requires graph-backed `chain_run` and `cosmonauts run chain` to expose `{ runId, scope: "chain" }`, but the current chain API has no place for that data. `runDurableChain()` generates `runId` locally and returns only `Promise<ChainResult>`; `ChainResult` contains success/stage/duration/error/stats fields only; `chain-tool.ts` currently returns only `{ lines, result }` in structured details.

    The plan lists `lib/orchestration/types.ts` as a seam but does not define the shared return contract that T2, T3, and T6 must implement against. Independent workers could add incompatible metadata fields, wrap results differently between tool and CLI, or accidentally expose metadata for inline non-durable chains. Define the exact contract before tasking, e.g. whether `runDurableChain` returns a wrapper with `ref`, whether `ChainResult` gains optional durable metadata, and how inline chains report non-durable mode.

- id: PR-003
  dimension: interface-fidelity
  severity: medium
  title: "`run` subcommand bootstrap is underspecified against the existing parser split"
  plan_refs: plan.md:431, plan.md:435, plan.md:442, plan.md:445
  code_refs: cli/main.ts:119, cli/main.ts:151, cli/main.ts:170, cli/main.ts:363, cli/main.ts:373, cli/main.ts:795, cli/main.ts:829
  description: |
    The plan says to register `cosmonauts run` in the subcommand dispatch while preserving current workflow-mode behavior for domain, plugin-dir, model, thinking, completion-label, and profile options. In the current CLI, those options are parsed by the non-subcommand path: `parseCliArgs()` first runs `parsePiFlags()`, `buildCliParser()` defines `--domain`, `--plugin-dir`, `--model`, `--thinking`, etc., and `run()` bootstraps `CosmonautsRuntime.create()` with those values.

    Existing subcommands bypass that path entirely: `cli/main.ts` checks `process.argv[2]`, constructs a subcommand program, and parses `process.argv.slice(3)` directly. If `run` is added like the current `drive`/`task`/`plan` subcommands, it will not automatically receive Pi flag parsing, bundled/plugin domain discovery, or the current workflow runtime bootstrap. The plan should specify a shared bootstrap/flag-parsing seam for `cli/run/*` rather than leaving each worker to rediscover it.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "Drive resume's original task-set metadata is not pinned in the `runStart` refactor"
  plan_refs: plan.md:95, plan.md:100, plan.md:371, plan.md:671
  code_refs: lib/driver/drive-graph-compiler.ts:44, lib/driver/drive-graph-compiler.ts:49, lib/driver/drive-graph-runner.ts:199, lib/driver/drive-graph-runner.ts:203, lib/driver/drive-graph-runner.ts:214, lib/driver/drive-graph-runner.ts:218, cli/drive/subcommand.ts:920, cli/drive/subcommand.ts:943
  description: |
    Current graph-backed Drive preserves the original selected task set across resume by storing `metadata.driveTaskIds` when compiling the graph, then rewriting resumed specs through `withAuthoritativeTaskIds()` before rebuilding an empty/partial graph. The CLI resume path also computes `remainingTaskIds` from legacy events while keeping the original task list for the run.

    The plan says `runStart` compares the persisted graph to a graph compiled from "current inputs" and that Drive graph compilation will be split, but it does not explicitly require the refactor to compile/repair Drive graphs from the persisted original `driveTaskIds` instead of any remaining-task slice or current task selection. If that rule is lost, a resumed or partially initialized Drive run can look like a graph mismatch, lose sequential dependencies/finalizers, or be blocked by `run_start_graph_mismatch` even though the run is recoverable today.

    The planner should add an explicit Drive resume invariant and a named test around `driveTaskIds`/`remainingTaskIds` before T2, so the `runStart` refactor preserves this state source.

## Missing Coverage

- `watch_events` parity should cover partial normalized-stream gaps, not only total absence of `run_activity` compatibility events.
- `cosmonauts run chain` needs explicit tests for the top-level options currently handled by workflow mode: `--domain`, `--plugin-dir`, `--model`, `--thinking`, `--completion-label`, and `--profile`.
- The durable-chain metadata contract should define the inline/non-durable result shape as well as graph-backed `{ scope, runId }`.
- Drive resume coverage should include a Plan-2-created run with original `driveTaskIds`, a resumed `remainingTaskIds` slice, and partial graph/step seeding repair.

## Assessment

The plan is viable with revisions. The most important fix is the `watch_events` compatibility fallback: without a way to detect partial normalized-event loss, the plan can silently break the existing Drive observation tool it promises to preserve.
