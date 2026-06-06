# Plan Review: durable-run-store-events

## Findings

- id: PR-001
  severity: blocker
  affects: B-005; Drive event mapping rules; Run status synchronization
  refs: missions/plans/durable-run-store-events/plan.md:93-100, missions/plans/durable-run-store-events/plan.md:287-300, missions/architecture/durable-orchestration-runtime.md:400-418
  why: |
    The plan preserves Drive-specific evidence by adding `details`, progress/contradiction data, and retryability onto terminal normalized events: `task_blocked -> step_blocked with reason, progress, and contradicted-path details`; `task_finalization_failed -> step_failed with ... retryable`; `run_aborted`/`run_finalization_failed -> run_failed` with source outcome, phase, task, commit, and reason details.

    The architecture's Core Contract defines these terminal variants without those fields: `step_blocked` and `step_failed` have only `reason`, and `run_failed` has only `reason`. The only normalized event variant with a `details` field is `step_tool_activity`. Implementing the plan literally creates an `OrchestrationEvent` type that is not the source-of-truth union.
  concrete_fix: |
    Either keep terminal events exactly canonical and put rich Drive evidence into preceding `step_tool_activity` events / controller diagnostics, or update the architecture Core Contracts before Plan 1 to add explicit detail fields to the terminal variants. Do not let `lib/durable-runtime/types.ts` invent extra fields locally.

- id: PR-002
  severity: major
  affects: AC-003; B-004; B-005; Drive event mapping rules
  refs: missions/plans/durable-run-store-events/spec.md:23-24, missions/plans/durable-run-store-events/plan.md:83-100, missions/plans/durable-run-store-events/plan.md:293-295, missions/architecture/durable-orchestration-runtime.md:421-426, lib/driver/run-one-task.ts:83-88, lib/driver/run-one-task.ts:520-567, lib/driver/run-run-loop.ts:94-104
  why: |
    The plan claims normalized events represent Drive task terminal outcomes and says terminal task events map to terminal step events. Current Drive has a terminal task-blocked path with no legacy `task_blocked` event: `runOneTask` emits `task_started`, emits failed `preflight`, returns `{ status: "blocked" }`, and `runRunLoop` emits only `run_aborted` for that blocked outcome.

    Because the plan maps `preflight` only to `step_tool_activity`/`artifact_written`, a preflight-failed task would leave a normalized `step_ready` without a terminal `step_blocked`/`step_failed`. That violates the architecture requirement that the event stream alone can reconstruct terminal state.
  concrete_fix: |
    Add an explicit behavior and translator rule for failed `preflight` events to emit a canonical terminal step event (probably `step_blocked` with the preflight failure reason), and cover branch-mismatch / command-failure preflight cases in `tests/driver/durable-events.test.ts` or the dual-write integration test.

- id: PR-003
  severity: major
  affects: Architecture Context storage compatibility note; B-006; Files to Change / documentation
  refs: missions/plans/durable-run-store-events/plan.md:47-49, missions/plans/durable-run-store-events/plan.md:103-110, missions/plans/durable-run-store-events/plan.md:304-306, missions/architecture/durable-orchestration-runtime.md:512-540, domains/shared/extensions/orchestration/watch-events-tool.ts:25-35, cli/drive/subcommand.ts:735-738
  why: |
    The architecture Storage Layout says `events.jsonl` is the normalized `OrchestrationEvent` stream. The plan locally creates a Plan-1 exception where Drive normalized events go to `orchestration-events.jsonl` while legacy Drive keeps `events.jsonl`. The source code confirms why this is needed today: `watch_events` hard-codes `events.jsonl`, and Drive specs default `eventLogPath` to `events.jsonl`.

    The exception is reasonable for Drive compatibility, but it is not in the source-of-truth architecture record. A child plan should not silently override the canonical Storage Layout while the review prompt identifies that layout as authoritative.
  concrete_fix: |
    Record the Plan-1 Drive sidecar exception in `missions/architecture/durable-orchestration-runtime.md` (while preserving the target layout), or change the plan to conform to the architecture layout without changing legacy `watch_events`/resume behavior. The plan should not be the only place that authorizes this storage deviation.

- id: PR-004
  severity: major
  affects: Plan 1 acceptance; B-006; B-012; B-013; B-014
  refs: missions/architecture/durable-orchestration-runtime.md:660-663, missions/plans/durable-run-store-events/plan.md:103-110, missions/plans/durable-run-store-events/plan.md:163-190, lib/driver/driver.ts:66-84, lib/driver/run-step.ts:58-76
  why: |
    The architecture acceptance for Plan 1 requires `run_status`/`run_watch` to report correct state for a real Drive run. The plan splits proof across dual-write tests (only assert `run.json` and sidecar envelopes exist) and controller/tool tests over normalized events, but no behavior proves the controller reads the `RunRecord.eventsPath` sidecar produced by the Drive adapter for an actual Drive run.

    This leaves the key integration seam untested: `runInline`/`run-step` create the Drive event sink, the adapter creates/adopts `run.json`, and `run_status`/`run_watch` must consume that exact persisted record/event stream.
  concrete_fix: |
    Add a behavior/test that runs the existing Drive loop with a fake backend through the dual-write path, then calls `runStatus` and `runWatch` (or the tools) against the resulting run directory and asserts the normalized state/events are reported from `run.json.eventsPath`.

- id: PR-005
  severity: major
  affects: B-007; Drive dual-write integration; zero behavior change constraint
  refs: missions/plans/durable-run-store-events/plan.md:113-121, missions/plans/durable-run-store-events/plan.md:201-204, missions/plans/durable-run-store-events/plan.md:260-274, lib/driver/driver.ts:66-84, lib/driver/run-step.ts:58-76
  why: |
    B-007 covers normalized append failure after the legacy event log is writable, but the planned Drive adapter also "creates/adopts a Drive `RunRecord`". Existing `runInline` and `run-step` construct the event sink before entering `runRunLoop`; if the new durable sink performs run-record creation/adoption eagerly and that fails, Drive will fail before the legacy sink emits anything, violating the zero behavior-change constraint.
  concrete_fix: |
    Specify that durable run-record creation/adoption is lazy and failure-isolated inside the durable sink, or wrap durable sink construction so failures degrade to diagnostics only. Add a negative test where normalized run-record creation fails before the first event and the Drive run still proceeds with legacy events.

- id: PR-006
  severity: minor
  affects: Implementation Order / characterization strategy
  refs: missions/plans/durable-run-store-events/plan.md:370-375, cli/drive/subcommand.ts:449-454, cli/drive/subcommand.ts:457-485, domains/shared/extensions/orchestration/watch-events-tool.ts:25-35, lib/driver/event-stream.ts:349-377
  why: |
    The plan says the compatibility characterization tests should initially fail only because normalized files/helpers do not exist. For B-008, B-009, and B-011, the current code already ignores normalized runtime files if a test manually places `run.json` / `orchestration-events.jsonl`: status/list check only legacy state files, and `watch_events` reads only legacy `events.jsonl` with line-count cursors.
  concrete_fix: |
    Rephrase the first implementation step so compatibility characterization tests are expected to pass against current behavior when normalized sidecar files are manually seeded; only tests that require the new runtime files/tools should start red.

- id: PR-007
  severity: minor
  affects: Quality Contract
  refs: missions/plans/durable-run-store-events/plan.md:356-364, domains/shared/skills/work-artifacts/references/gate-contracts.md:7-18
  why: |
    The Quality Contract orders `boundary-conformance` before `mutation`, but the artifact contract orders applicable gates as correctness, artifact-conformance, mutation, duplication, complexity, boundary-conformance, dead-code. This is a mechanical artifact issue, not a runtime design flaw.
  concrete_fix: |
    Move the mutation row before the boundary-conformance row, or explicitly justify a project-specific ladder deviation.

## Missing Coverage

- Failed preflight normalization in a real Drive run, especially branch mismatch and failing preflight command.
- `run_status`/`run_watch` over the exact `run.json` + `orchestration-events.jsonl` produced by Drive dual-write.
- Durable run-record creation/adoption failure isolation before the first legacy event is emitted.
- Architecture-level authorization for the Drive `orchestration-events.jsonl` sidecar exception.

## Assessment

The plan is directionally aligned with the wave-1 scope and current Drive compatibility constraints, but it is not ready for tasking. The first issue to fix is the event contract mismatch: workers must not implement terminal normalized event shapes that contradict the architecture Core Contracts.
