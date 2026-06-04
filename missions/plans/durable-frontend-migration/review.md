# Plan Review: durable-frontend-migration

## Findings

- id: PR-001
  dimension: graph/finalizer-correctness
  severity: high
  title: "Retryable finalizer failures will be normalized to blocked unless the plan sets retry policy or maps before scheduler transition"
  plan_refs: plan.md:219-227, plan.md:456-463, plan.md:487-492
  code_refs: lib/durable-runtime/scheduler.ts:1477-1488, lib/durable-runtime/scheduler.ts:1523-1532, missions/architecture/durable-orchestration-runtime.md:574-579
  description: |
    The plan expects a failed source/task-status/state-commit finalizer to record `result.nextAction: "retry"` and then map to Drive `outcome: "finalization_failed"` with pending-finalization evidence. The architecture record also says finalization failure is a finalizer step that fails with `result.nextAction: "retry"` and is mapped by the Drive compatibility layer.

    The current scheduler does not persist that shape by default. `stepTransitionFromResult` retries only when `attemptNumber < maxAttempts`; otherwise it wraps the result as blocked, changes `nextAction` to `"wait_for_human"`, and changes the summary to retry exhaustion. `effectiveMaxAttempts` defaults to `1` when neither `step.retryPolicy.maxAttempts` nor `run.policy.retryLimit` is set. The plan's Drive graph compiler section says to seed every graph step in `pending` status, but it does not require retry policy on finalizer steps or specify that Drive maps the raw failed result before scheduler normalization.

    As written, B-015 can pass a shell finalizer result with `nextAction:"retry"` and still end up with a persisted blocked step whose result no longer has `nextAction:"retry"`, breaking the finalization_failed compatibility contract. The planner should specify the finalizer retry policy / mapping seam explicitly.

- id: PR-002
  dimension: interface-fidelity
  severity: high
  title: "Normalized chain events do not carry enough data to reconstruct existing agent ChainEvents"
  plan_refs: plan.md:129-137, plan.md:349-361
  code_refs: lib/orchestration/types.ts:275-300, lib/durable-runtime/types.ts:241-279, missions/architecture/durable-orchestration-runtime.md:399-419
  description: |
    B-006 says `chain-event-adapter.ts` observes normalized `OrchestrationEvent`s plus compiler metadata and emits equivalent existing `ChainEvent` variants, including `agent_*`, without changing the CLI logger or tool renderer contracts. Existing `ChainEvent` variants require fields that normalized events do not carry: `agent_spawned`, `agent_completed`, `agent_turn`, and `agent_tool_use` all require `role` and `sessionId`, and turn/tool events embed `SpawnEvent` data.

    The durable runtime event contract currently has `step_started` with only `{ runId, stepId, backend }`, terminal step events, `step_output`, and `step_tool_activity` with opaque details. There is no session ID in `OrchestrationEvent`, `StepResult`, or `SchedulerStepInput`, and the scheduler backend interface does not receive a store/event sink for appending chain-specific normalized details. Compiler metadata can recover the role, but not the Pi session ID or spawn event payloads.

    A worker implementing the adapter literally cannot produce type-correct equivalent `agent_*` events from normalized scheduler events alone. The plan needs a precise event evidence contract for chain backends, or it must narrow/degrade B-006 instead of promising full equivalence.

- id: PR-003
  dimension: event/watch-compatibility
  severity: medium
  title: "Drive graph event strategy requires a sink mode that the current event-stream API does not provide"
  plan_refs: plan.md:487-492, plan.md:502-509, plan.md:556-558
  code_refs: lib/driver/event-stream.ts:106-124, lib/driver/event-stream.ts:177-199, lib/driver/durable-events.ts:52-159, domains/shared/extensions/orchestration/watch-events-tool.ts:25-35
  description: |
    The plan correctly states that graph runs must keep legacy `events.jsonl` for `watch_events` while letting scheduler events own normalized lifecycle in `orchestration-events.jsonl`. It also says the Drive event sink may append only non-duplicative backend/activity evidence.

    The current `createEventSink` API has only an optional `durable` configuration; when present, every legacy event is passed to `processDurableDriverEvent`. That path normalizes lifecycle events such as `run_started`, `task_started`, `spawn_started`, `task_done`, `task_blocked`, `run_completed`, `run_aborted`, and `run_finalization_failed`, and also projects step/finalizer records. There is no current option for "legacy JSONL only" or "durable backend details only". Meanwhile `watch_events` is hard-wired to read legacy `missions/sessions/<plan>/runs/<runId>/events.jsonl`.

    Without a named API contract for this new sink mode, separate workers can wire `runDriveOnGraph` to the existing durable sink and double-write normalized lifecycle against the scheduler, exactly the blocker the plan identifies. The plan should define the event-stream interface change explicitly enough that runner and event-stream workers implement the same compatibility boundary.

- id: PR-004
  dimension: state-sync
  severity: medium
  title: "Resume currently mutates `spec.taskIds` to the remaining queue, which conflicts with graph recovery and original-run finalizers"
  plan_refs: plan.md:269-277, plan.md:391-404, plan.md:429-433, plan.md:487-488
  code_refs: cli/drive/subcommand.ts:888-910, cli/drive/subcommand.ts:766-821, cli/drive/subcommand.ts:1452-1467, lib/driver/types.ts:24-47
  description: |
    B-020 says graph resume loads existing run state, resumes from persisted graph/step records, avoids duplicating completed steps, and preserves original selected order. The Drive compiler rules also say the compiler preserves `spec.taskIds` exactly and the scheduler bridge validates the task ID belongs to `spec.taskIds`.

    Existing resume does something different: `loadResumeDefaults` reads legacy `events.jsonl`, computes the highest `task_done`/`task_blocked` index, and returns only `spec.taskIds.slice(completedIndex + 1)` as `resume.taskIds`. `createRunSpec` then writes that shortened array back as `spec.taskIds`. That was safe for the legacy queue loop, but graph resume needs the original graph and finalizer dependencies to remain authoritative. A terminal state-commit finalizer and any all-task completion accounting need the original selected task set, while backend validation over the shortened `spec.taskIds` will reject any persisted graph task outside the remaining slice if it ever needs recovery/retry.

    The plan says not to fabricate in-memory defaults, but it does not specify how CLI resume separates the original selected task IDs from the remaining legacy queue view. The planner should make that state boundary explicit before workers change the graph runner and CLI independently.

- id: PR-005
  dimension: scope-alignment
  severity: medium
  title: "B-013 requires registering all Drive backends, but current Drive construction resolves only the selected backend and detached mode rejects one of them"
  plan_refs: plan.md:199-207, plan.md:410-427, plan.md:446-450, plan.md:469-477
  code_refs: cli/drive/subcommand.ts:255-269, cli/drive/subcommand.ts:328-344, cli/drive/subcommand.ts:1480-1511, lib/driver/driver.ts:127-134, lib/driver/run-step.ts:56-63, lib/driver/run-step.ts:93-95
  description: |
    B-013 says a Drive graph run registers `codex`, `claude-cli`, and `cosmonauts-subagent` with the scheduler. The proposed `createDriveSchedulerBackendMap` also takes `backends: Record<BackendName, Backend>`. But the actual Drive startup path resolves exactly one backend from the run's selected `backendName`: `runDrive` calls `createBackend(backendName, mode, projectRoot)`, `DriverDeps` carries one `backend`, and the frozen child resolves only `spec.backendName`.

    There is also an explicit detached compatibility rule: both the CLI and `startDetached` reject `cosmonauts-subagent` for detached mode. Requiring every graph run, including detached frozen runs, to construct/register all three production backends is broader than the current Drive surface and not supported by the existing interfaces in the plan's `RunDriveOnGraphContext`.

    This looks like scope creep from a recovery capability test into production construction. The planner should either narrow B-013 to the selected backend plus `shell-command`, or specify a concrete backend-construction contract that handles detached `cosmonauts-subagent` without violating existing UX.

- id: PR-006
  dimension: behavior-spec
  severity: medium
  title: "Behavior sources are not linked to AC-### acceptance criteria"
  plan_refs: plan.md:77-297, spec.md:20-31
  code_refs: domains/shared/skills/work-artifacts/references/behavior-spine.md:5-21, domains/shared/skills/work-artifacts/references/plan-format.md:18-42
  description: |
    The plan has stable B-### behavior IDs, seams, tests, and markers, but the `Source` fields use values such as `spec FR-3`, `D-008`, `Scenario 1`, or `compatibility surface`. The spec file only has a "Functional Requirements Seed" numbered list; it does not define `AC-###` acceptance criteria.

    The artifact contract for full planned feature/refactor work requires specs to use `AC-###` IDs and every plan behavior to link `Source: AC-###`. Without AC IDs, workers and reviewers cannot mechanically trace the behavior spine from product acceptance criteria to behavior tests, and the artifact-conformance gate cannot prove source coverage. The planner should either add AC-### criteria to the spec and update all `Source` fields, or explicitly re-scope this artifact tier.

## Missing Coverage

- Chain event tests need a negative/proof case for agent event fidelity: either a session ID is captured durably and adapted, or the plan explicitly degrades `agent_*` equivalence.
- Drive graph resume needs a test where `--resume` follows one completed task plus a pending final state commit, proving original selected task IDs are retained separately from remaining work.
- Event compatibility needs a test that `orchestration-events.jsonl` has no duplicate scheduler lifecycle events while `watch_events` still sees legacy `events.jsonl` summaries.
- Finalizer tests need to assert the persisted finalizer `StepRecord.result.nextAction` remains `"retry"` after scheduler transition, not just that `pending-finalization.json` exists.
- The Quality Contract names a concrete project command in the artifact-conformance threshold (`plan.md:571`), while the generic gate contract says concrete tool bindings should not be embedded in the ladder; this should be cleaned up even if not blocking design viability.

## Assessment

The plan is viable with revisions, but the finalizer retry/scheduler transition mismatch is the first issue to fix because it breaks the core Drive finalization recovery behavior. The next most important fixes are making chain/Drive event contracts explicit enough for independent workers and separating original Drive task selection from resume's remaining queue state.
