# Plan Review: durable-backend-step-model

## Findings

- id: PR-006
  dimension: interface-fidelity
  severity: high
  title: "State-commit resume acceptance failures still have no terminal event or durable hook"
  plan_refs: plan.md:129-135, plan.md:173, plan.md:359-365, plan.md:450
  code_refs: cli/drive/subcommand.ts:981-1022, cli/drive/subcommand.ts:1041-1083, cli/drive/subcommand.ts:1118-1133, lib/driver/state-commit.ts:59-72, lib/driver/state-commit.ts:126-134
  description: |
    B-009 covers source commit, task status, and state commit resume recovery, and requires every resume retry to append a finalizer attempt that records success or another retryable failure. The revision correctly calls out source-commit and task-status retry failures as paths that write `run.completion.json` without terminal `DriverEvent`s, but the same gap exists for part of the state-commit resume path.

    `retryPendingStateCommit` calls `commitFinalState`; direct commit failures do emit `finalize` failed before returning `status: "failed"` (`lib/driver/state-commit.ts:126-134`). But when `commitFinalState` returns `skipped` with `reason: "no_changes"`, `acceptExternalStateCommit` can reject recovery because a pending task is not Done, task files are still dirty, or HEAD is unchanged (`cli/drive/subcommand.ts:1005-1022`, `cli/drive/subcommand.ts:1049-1076`). Those failures go to `writeStateFinalizationFailure`, which only writes completion JSON and prints stdout (`cli/drive/subcommand.ts:1118-1133`); no terminal `DriverEvent` is emitted.

    The planner should extend B-009 and the durable-only hook requirement to these state-commit external-acceptance failure paths, or narrow B-009 so it no longer promises failed state-commit resume attempts are always recorded.

- id: PR-007
  dimension: interface-fidelity
  severity: high
  title: "Parsed report evidence does not match StepResult file/verification types"
  plan_refs: plan.md:99-106, plan.md:322-330
  code_refs: lib/driver/types.ts:61-69, lib/driver/types.ts:119-123, lib/durable-runtime/types.ts:72-82
  description: |
    The task projection rules say `verify` events enrich `StepResult.verification`, with `not_run` mapping to runtime `skipped` and `pass`/`fail` mapping directly. The plan also expects parsed report evidence to populate terminal `StepResult` fields.

    The code has two different verification vocabularies at this seam: `ParsedReport.verification.status` is `"pass" | "fail" | "not_run"` (`lib/driver/types.ts:61-69`), while legacy `DriverEvent` `verify.status` is `"started" | "passed" | "failed"` (`lib/driver/types.ts:119-123`). Runtime `VerificationResult.status` is `"pass" | "fail" | "skipped"` (`lib/durable-runtime/types.ts:79-82`). A literal implementation of the plan's `verify`-event rule would either look for `not_run` on an event where it cannot occur, or try to store `"passed"`/`"failed"` in a runtime field that expects `"pass"`/`"fail"`.

    The same parsed-report mapping needs an explicit file-change conversion: `Report.files[].change` uses `"created" | "modified" | "deleted"`, while runtime `FileChangeSummary.status` uses `"added" | "modified" | "deleted" | "renamed"` (`lib/durable-runtime/types.ts:72-75`). The planner should specify separate mappings for parsed report evidence and driver `verify` events before tasking.

- id: PR-008
  dimension: state-sync
  severity: medium
  title: "Step backend identity can diverge between spec policy, legacy events, and the new strict backend union"
  plan_refs: plan.md:79-85, plan.md:180-190, plan.md:324-326
  code_refs: lib/driver/backends/types.ts:26-30, lib/driver/types.ts:96-100, lib/driver/run-one-task.ts:165-169, lib/driver/event-stream.ts:115-117, tests/driver/driver-durable-dual-write.test.ts:291-318
  description: |
    B-004 expects task `StepRecord.backend.name` to match the configured Drive backend identity, and the design says `task_started` creates a step with `backend` from `DriverRunSpec.backendName`. The new persisted `BackendName` union only allows known values plus the run-policy compatibility value `unknown`.

    Existing Drive emits `spawn_started.backend` from `ctx.backend.name`, not from `DriverRunSpec.backendName` (`lib/driver/run-one-task.ts:165-169`). The `Backend` interface exposes `name: string` (`lib/driver/backends/types.ts:26-30`), and existing integration tests use a fake backend named `"fake-backend"` while the spec's configured backend is `"cosmonauts-subagent"` (`tests/driver/driver-durable-dual-write.test.ts:291-318`). Plan-1 durable run policy stores `spec.backendName` (`lib/driver/event-stream.ts:115-117`), while normalized `step_started` uses the event backend string (`lib/driver/durable-events.ts:32-38`).

    If Plan 2 uses `DriverRunSpec.backendName`, step records can disagree with normalized `step_started` events. If it uses `spawn_started.backend`, test/programmatic backends can fall outside the strict `KnownBackendName` union. The planner should define the authoritative backend identity source and how adapter/projector code handles mismatches or test fakes.

- id: PR-009
  dimension: architecture-record
  severity: medium
  title: "BackendSpec and backend-name types have two declared homes"
  plan_refs: plan.md:163-164, plan.md:178-194, plan.md:390-391
  code_refs: lib/durable-runtime/types.ts:33-40, lib/durable-runtime/types.ts:117-127
  description: |
    The module-boundary section says `lib/durable-runtime/types.ts` should add `KnownBackendName`, `BackendName`, `BackendSpec`, and `StepRecord.backend`. The generic backend contract section then defines the same backend-name and `BackendSpec` types inside the new `lib/durable-runtime/backends.ts`, while `Files to Change` again assigns those types to `types.ts` and assigns backend contracts to `backends.ts`.

    Existing persisted contracts live in `lib/durable-runtime/types.ts`: `RunPolicy.defaultBackend` uses `BackendPolicy` there, and `StepRecord` is also defined there. The new `OrchestrationBackend` contract must import `RunRecord` and `StepRecord` from `types.ts`; if `BackendSpec` is also owned by `backends.ts`, `types.ts` either has to import back from `backends.ts` or duplicate the type. That creates a needless cycle/duplication risk at the exact public contract boundary independent workers will share.

    The planner should choose one authoritative home for `KnownBackendName`/`BackendName`/`BackendSpec` and update the design snippets and file list to match it.

## Missing Coverage

- B-009 needs explicit tests for state-commit resume failures that occur after `commitFinalState` returns `skipped` and `acceptExternalStateCommit` rejects recovery (`pending task is not Done`, dirty task paths, or unchanged HEAD).
- B-004 only says dependencies come from `DriverRunSpec.taskIds`; resume rewrites the active spec to the remaining task slice, so the plan does not cover whether resumed task step records should preserve dependencies on already-completed earlier tasks.
- B-006 should specify the terminal `StepRecord.status` for a malformed report followed by legacy `task_done` (`completed` with `result.outcome: "unknown"`, `blocked`, or another status), not only the `StepResult.outcome` and normalized event result.
- B-002 defines required `BackendCapabilities` fields but does not pin expected `canResume`, `canCancel`, or `emitsMachineReport` values for the three current Drive backends.

## Assessment

The plan remains viable with revisions. The most important fix is the unhandled state-commit resume failure seam; without it, B-009 can still leave a resumed finalizer attempt without retryable failure evidence.
