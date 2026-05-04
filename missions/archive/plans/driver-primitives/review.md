# Plan Review: driver-primitives

## Findings

- id: PR-001
  dimension: interface-fidelity
  severity: high
  title: "DriverRunSpec cannot support Plan 3's run-step binary"
  plan_refs: missions/plans/driver-primitives/plan.md:186-199, missions/plans/driver-primitives/plan.md:343-357, missions/plans/external-backends-and-cli/plan.md:202-220, missions/plans/external-backends-and-cli/plan.md:398
  code_refs: lib/tasks/task-manager.ts:54-60
  description: |
    Plan 1 defines `DriverRunSpec` with `planSlug`, `taskIds`, backend name, prompt/command fields, `workdir`, and `eventLogPath`, but it does not include `runId`, `parentSessionId`, or `projectRoot`. Plan 3's compiled binary reads `spec.json` and immediately uses `spec.runId`, `spec.parentSessionId`, and `spec.projectRoot` to create the `EventSink`, construct `TaskManager`, and call `runOneTask`.

    `TaskManager` requires a project root in its constructor, and Plan 1's `RunOneTaskCtx` requires `runId` and `parentSessionId`; those values cannot be reconstructed from the serialized Plan 1 spec as written. This is a cross-plan contract failure: either Plan 1's serialized run spec must include these fields, or Plan 3 must define a separate `SerializedDriverRunSpec` and not claim it writes a serialized `DriverRunSpec`.

- id: PR-002
  dimension: interface-fidelity
  severity: high
  title: "BackendInvocation cannot tag spawn_activity events, and SpawnConfig omits parentSessionId"
  plan_refs: missions/plans/driver-primitives/plan.md:281-289, missions/plans/driver-primitives/plan.md:316-333, missions/plans/driver-primitives/plan.md:454
  code_refs: lib/orchestration/types.ts:323-355, lib/orchestration/agent-spawner.ts:275-283, lib/orchestration/agent-spawner.ts:318-334
  description: |
    The revised `BackendInvocation` still lacks `runId`, but the cosmonauts-subagent sketch tries to build a `DriverEvent.spawn_activity` with `runId: invocation.runId`. There is no `invocation` object in scope after destructuring, and `runOneTask`'s backend call also omits `runId`, so backend-emitted driver events cannot satisfy `DriverEventBase.runId`.

    The same sketch passes `planSlug`, `runtimeContext`, `cwd`, and `onEvent` to `spawner.spawn`, but not `parentSessionId`. Existing `SpawnConfig` has `parentSessionId`, and `persistPlanLinkedSpawn` only records parent-child lineage when `config.parentSessionId` is set. Passing `parentSessionId` only into the event mapper fixes routing, but not lineage.

- id: PR-003
  dimension: interface-fidelity
  severity: high
  title: "DriverEvent union does not admit events the loop and QC require"
  plan_refs: missions/plans/driver-primitives/plan.md:217-232, missions/plans/driver-primitives/plan.md:457-468, missions/plans/driver-primitives/plan.md:604-608
  code_refs: missions/plans/driver-primitives/plan.md:217-232
  description: |
    `parseReport` returns `ParsedReport = Report | { outcome: "unknown"; raw: string }`, and the loop says to emit `spawn_completed` with the parsed report. The `DriverEvent` union types `spawn_completed.report` as `Report`, so the documented `unknown` parser path cannot be emitted without casts or dropping the raw report.

    The loop also emits `verify(started)`, but the `verify` event status only allows `"passed" | "failed"`. QC-009 requires a stale-lock warning event, but no warning/lock event variant exists. These are internal contract mismatches that will make the planned event tests or implementation fail unless the event union is widened.

- id: PR-004
  dimension: interface-fidelity
  severity: medium
  title: "Failure branches update TaskManager with unsupported `note` field"
  plan_refs: missions/plans/driver-primitives/plan.md:466-476
  code_refs: lib/tasks/task-types.ts:105-127, lib/tasks/task-manager.ts:160-180
  description: |
    The loop specifies `TaskManager.updateTask(taskId, { status: "Blocked", note: "post-verify failed" })` and the same `note` field for the no-files-changed path. `TaskUpdateInput` has `implementationNotes`, but no `note` field, and `updateTask` merges only typed input fields.

    Workers following this literally will get TypeScript excess-property errors at direct `TaskManager.updateTask` calls. The plan should specify the existing `implementationNotes` field, or explicitly add a new field to the task type and serializer.

- id: PR-005
  dimension: state-sync
  severity: high
  title: "Detached mode can break the plan lock while the detached run is still active"
  plan_refs: missions/plans/driver-primitives/plan.md:62-65, missions/plans/driver-primitives/plan.md:383-390, missions/plans/external-backends-and-cli/plan.md:237-248, missions/plans/external-backends-and-cli/plan.md:389-410, missions/plans/external-backends-and-cli/plan.md:440-442
  code_refs: missions/plans/external-backends-and-cli/plan.md:237-248
  description: |
    Plan 1's lock content is `{ runId, pid, startedAt }`, and stale-lock handling breaks the lock when that PID is dead. Plan 3 says `startDetached` acquires the Plan 1 lock in the parent process, then spawns `nohup bash run.sh`, returns a handle, and the CLI exits while the background script continues. The per-task binary calls `runOneTask`, not `acquirePlanLock`.

    If the parent CLI/Pi process exits, the lock PID is dead even though the detached bash/binary run is still mutating tasks and git. The next same-plan run can classify the lock as stale and break it, allowing concurrent writers. If the parent process stays alive, the plan does not specify how the lock is released when the detached bash run finishes. Lock ownership needs to move to the detached process or have a durable release/heartbeat protocol before Plan 3 can safely build on Plan 1's lock.

- id: PR-006
  dimension: interface-fidelity
  severity: medium
  title: "Driver bus events collide with the existing `spawn_activity` subscription"
  plan_refs: missions/plans/driver-primitives/plan.md:219-225, missions/plans/driver-primitives/plan.md:490-508, missions/plans/driver-primitives/plan.md:527-528
  code_refs: lib/orchestration/message-bus.ts:44-57, lib/orchestration/message-bus.ts:92-110, domains/shared/extensions/orchestration/index.ts:105-126
  description: |
    `DriverEvent` uses `type: "spawn_activity"` for driver activity, and `shouldBridge` whitelists `spawn_activity` for bus publishing. The existing orchestration extension already subscribes to bus event type `"spawn_activity"` and assumes the `SpawnActivityEvent` shape: `spawnId`, `role`, `taskId`, and `activity.summary`.

    A driver `spawn_activity` event has `runId`, `parentSessionId`, `taskId`, and `activity`, but no `spawnId` or `role`. If `toBusEvent` preserves the event type, the existing subscriber will receive the wrong shape; if it maps to a different type, that mapping is not part of the contract. The plan needs an explicit driver bus event name/shape so the new bridge does not interfere with the existing spawn bridge.

## Missing Coverage

- Prior findings F-001, F-002, F-006, F-008, F-009, and F-010 are closed at the Plan 1 text level: Title Case statuses are used for TaskManager updates, Pi tools use `parameters`/`execute`, a plan-level O_EXCL lock is specified, name-only backend resolution is removed from Plan 1's tool path, `watch_events` takes `planSlug + runId`, and Plan 1 now points to Plan 2 for the bundled envelope.
- `deriveOutcome` branches are not explicitly in the QC. The parser has unknown-output tests, but the quality contract should verify `unknown + postverify pass => success` and `unknown + postverify fail => blocked/failure` at the `runOneTask` level.
- `tailEvents`/`watch_events` still lack explicit behavior for malformed JSONL lines, partial final lines, and cursors beyond EOF. Plan 3 covers bridge partial-line behavior, but Plan 1's `tailEvents` contract remains underspecified.
- Backend exit-code/report conflicts remain underspecified: e.g. `exitCode !== 0` with a parseable `success` report, or `exitCode === 0` with an explicit `failure` report.
- The cosmonauts-subagent backend sketch does not say whether it must pass `domainContext`, `projectSkills`, and `skillPaths` through `SpawnConfig`; the existing spawn tool passes those fields to preserve runtime resolution and skill filtering.

## Assessment

Verdict: revise. The major prior review issues are mostly addressed in prose, but the revision introduces new contract mismatches around serialized run specs, backend event tagging, event union coverage, and detached lock ownership. The first issue to fix is the Plan 1/Plan 3 run-spec boundary (`runId`, `parentSessionId`, `projectRoot`, backend resolution, and lock ownership), because Plan 3's binary cannot safely call `runOneTask` without it.
