# Plan Review: orchestration-surface-consolidation

## Findings

- id: PR-006
  dimension: interface-fidelity
  severity: medium
  title: "Named-chain resolution is ambiguous for shipped names that also parse as raw DSL"
  plan_refs: plan.md:160-167, plan.md:401-407, plan.md:638-657
  code_refs: bundled/coding/coding/workflows.ts:20-23, bundled/coding/coding/workflows.ts:33-37, lib/orchestration/chain-steps.ts:127-160, cli/main.ts:287-302
  description: |
    The plan says `cosmonauts run chain <expression-or-name>` resolves either raw DSL via `isChainDslExpression` or named chains via `lib/chains/loader.ts`, and B-011 expects named chains to run through the CLI. The existing shipped workflow set includes names such as `verify` and `adapt`, and `isChainDslExpression()` explicitly returns true for single-stage-looking names such as `planner`, `task-manager`, and any one-hyphen-or-less segment.

    Current CLI workflow resolution checks `isChainDslExpression()` first and returns the raw expression before trying `resolveWorkflow()`. If a worker carries that order into `run chain`, `run chain verify` and `run chain adapt` will be treated as raw agent stages instead of named chains. Those are shipped named pipelines today, so the renamed surface can make existing defaults unreachable or fail during agent parsing.

    The plan needs to prescribe precedence or disambiguation for names that are also valid single-stage DSL. At minimum, test B-011 should include one shipped single-token named chain, not only `plan-and-build`.

- id: PR-007
  dimension: interface-fidelity
  severity: medium
  title: "`RunStartResult` cannot represent pre-pass interruptions with the current scheduler exit type"
  plan_refs: plan.md:309-329, plan.md:318-321, plan.md:334-340
  code_refs: lib/durable-runtime/types.ts:220-232
  description: |
    The proposed `RunStartResult` extends `RunGraphSchedulerResult`, whose required `exitReason` is currently limited to `"terminal" | "drained" | "blocked" | "cancelled" | "waiting_for_fresh_external_work"`. The new stop-policy API can return a `RunStartInterruption` before any scheduler pass, and that interruption carries `exitReason: "interrupted"`.

    If `runStart` returns an interruption before a scheduler result exists, the contract does not say what required top-level `RunGraphSchedulerResult.exitReason`, `run`, `steps`, and `diagnostics` values should be. Setting top-level `exitReason: "interrupted"` does not type-check against the shipped union; fabricating `"drained"` or `"blocked"` changes observable semantics and forces workers to invent policy.

    The plan should either extend the durable runtime exit contract deliberately or make `RunStartResult` a separate union that specifies interruption-only results without pretending they are scheduler results.

- id: PR-008
  dimension: interface-fidelity
  severity: medium
  title: "Graph-backed Drive currently filters out any new `run_activity` compatibility events"
  plan_refs: plan.md:367-380, plan.md:628-636
  code_refs: lib/driver/driver.ts:95-101, lib/driver/run-step.ts:66-72, lib/driver/event-stream.ts:200-207, lib/driver/event-stream.ts:293-298
  description: |
    The plan requires Drive to append one `run_activity` compatibility event for every legacy `DriverEvent`, then rebuild `watch_events` from those normalized events. Graph-backed Drive does not append all normalized events produced by `normalizeDriverEvent()`: both inline Drive and the frozen detached runner create the durable sink with `driveGraphActivityEventSinkOptions()`, which sets `mode: "graph-activity-only"`.

    In that mode, `processDurableDriverEvent()` filters normalized events through `isGraphActivityEvent()`, and the allowed types are only `step_tool_activity`, `step_output`, and `artifact_written`. A newly added `{ type: "run_activity", ... }` event will be dropped unless the plan explicitly changes this filter or emits compatibility activity through a different path.

    Without that change, B-008/B-009 can pass only for non-graph legacy projection paths; the actual graph-backed Drive runs that Wave 2 observes will have no legacy compatibility events for `watch_events` to reconstruct.

- id: PR-009
  dimension: state-sync
  severity: medium
  title: "`runStart` resume rules miss partially initialized graph runs"
  plan_refs: plan.md:60-66, plan.md:90-98, plan.md:334-340
  code_refs: lib/orchestration/durable-chain-runner.ts:104-106, lib/driver/drive-graph-compiler.ts:51-57, lib/durable-runtime/scheduler-state.ts:48-56, lib/durable-runtime/scheduler.ts:417-429
  description: |
    The plan covers missing runs, existing runs with graph/steps, and existing runs with an empty graph plus no steps. The current initialization sequence has additional crash states: chain writes the graph and then initializes step records; Drive's compiler writes the graph and then writes each pending step record. A crash between those operations leaves a non-empty graph with zero or partial step records.

    The scheduler treats that state as a persisted-state error: reconciliation emits `missing_step_record`, and `runDurableGraphScheduler()` classifies that diagnostic as blocking. Under the plan's current rules, `runStart` would load the persisted graph, refuse to rewrite steps because the graph is not empty, and hand an initialization crash to the scheduler as a blocked run.

    B-001/B-004 should say whether `runStart` repairs incomplete initial seeding idempotently, blocks with explicit diagnostics, or relies on a stronger atomic initialization mechanism. Right now the resume safety behavior for this realistic interruption point is unspecified.

- id: PR-010
  dimension: behavior-spec
  severity: low
  title: "Non-goal tests can conflict with existing worktree and approval type vocabulary"
  plan_refs: plan.md:51-55, plan.md:240-247, plan.md:689-698
  code_refs: lib/durable-runtime/types.ts:42-53, lib/durable-runtime/types.ts:78-90
  description: |
    B-019 says final checks should prove there is no worktree isolation or approval gate, and T10 repeats that no worktree/parallel-mutation/approval work landed. The shipped durable runtime types already contain `StepKind` member `"approval"`, `WorktreeSpec.mode: "shared" | "isolated"`, and policy fields such as `maxParallelSteps`.

    If workers author B-019 as an absence/grep test over runtime types, it will fail before this plan starts or push them toward deleting existing public contract vocabulary from earlier durable-runtime phases. The intended non-goal appears to be no new execution behavior, CLI/docs surface, merge finalizer, or mutable parallel scheduling—not absence of every existing type member.

    Narrow B-019's expected result and test guidance to the concrete new surfaces that must stay absent, especially `nested-run`, parent run fields, `run spawn`, and new mutable-parallel execution paths.

- id: PR-011
  dimension: quality-contract
  severity: low
  title: "Quality Contract ladder order and boundary tier do not match the artifact contract"
  plan_refs: plan.md:581-592
  code_refs: domains/shared/skills/work-artifacts/references/gate-contracts.md:7-15, domains/shared/skills/work-artifacts/references/gate-contracts.md:47-55, domains/shared/skills/work-artifacts/references/plan-format.md:52-64
  description: |
    The plan's ladder puts `boundary-conformance` before `artifact-conformance` and `mutation`, and marks it as a universal bound gate. The work-artifacts contract says applicable gates are ordered as correctness, artifact-conformance, mutation, duplication, complexity, boundary-conformance, dead-code, and the shared ladder example only treats correctness and artifact-conformance as universal gates.

    This is not a code behavior problem, but it makes the Quality Contract non-conformant for a full planned feature/refactor artifact. Reorder the ladder and classify boundary conformance as a project-bound gate (with reviewer evidence if that is the binding) rather than a universal gate.

## Missing Coverage

- Cross-process `runStart` create-if-absent races for the same `RunRef`; `FileRunStore.createRun()` is not an exclusive create operation, so "creates exactly once" currently depends on external locks or unique IDs.
- Named-chain CLI disambiguation for a project-configured chain named `list`, since `run chain list` is also the listing command.
- Normalized-event fallback behavior when durable event append/setup fails but legacy Drive `events.jsonl` was written; after B-008, `watch_events` no longer reads the legacy file.
- Scope collision policy for Drive plans whose slug is the reserved chain scope (`chain`).

## Assessment

The revised plan is viable, but it still needs targeted contract tightening before tasking. The most important issue to fix first is named-chain resolution precedence, because the current helper order conflicts with shipped workflow names that the new surface is supposed to preserve as named chains.
