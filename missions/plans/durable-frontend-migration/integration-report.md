# Integration Report

plan: durable-frontend-migration
overall: incorrect

## Overall Assessment

Group B is not integration-ready: the core Drive-on-graph surfaces are broadly implemented and the project gates pass, but resume finalization can emit two incompatible CLI results and overwrite `run.completion.json` with a different shape. There is also a declared B-009 graph-shape mismatch: later drive task steps depend on prior task-status finalizers instead of the previous selected task step.

## Findings

- id: I-001
  priority: P1
  severity: high
  confidence: 0.95
  complexity: complex
  contract: AC-006 / B-020 CLI resume and completion compatibility
  files: cli/drive/subcommand.ts, lib/driver/drive-graph-runner.ts
  lineRange: cli/drive/subcommand.ts:280-302, cli/drive/subcommand.ts:1049-1058, cli/drive/subcommand.ts:1108-1118, cli/drive/subcommand.ts:365-379, lib/driver/drive-graph-runner.ts:136-145
  summary: A graph resume that successfully retries pending finalization with an empty remaining queue can print and write a completion result inside `retryPendingFinalization`, then `prepareResume` continues because the durable run is still not marked completed, clears the first completion, runs `runInlineMode`, and prints/writes a second result. Repro via a temp-project state-commit resume emitted two DriverResult JSON objects plus event JSON between them: first `{"runId":"run-previous","outcome":"completed","tasksDone":1,"tasksBlocked":0,"stateCommitSha":"..."}`, then after graph drain `{"runId":"run-previous","outcome":"completed","tasksDone":1,"tasksBlocked":0,"planCompletionCandidate":{...},"stateCommitSha":"..."}`; the final `run.completion.json` matched the second shape. This confirms the QM resume concern as a real defect: resumed CLI output can contain duplicate/inconsistent completion JSON.
  suggestedFix: Make pending-finalization retry return an explicit terminal result when it has already completed the run, and have `prepareResume`/`runDrive` stop without entering `runInlineMode`; alternatively do not print/write an interim completion before graph reconciliation. Add a regression test that asserts exactly one stdout DriverResult line and a single consistent final `run.completion.json` for pending state-commit/source/task-status resume success.
  task:
    title: Fix graph resume finalization to emit one terminal CLI result
    labels: plan:durable-frontend-migration,drive,resume,bug
    acceptanceCriteria:
      1. A `--resume` run that clears pending finalization with no remaining queue emits exactly one DriverResult JSON object.
      2. `run.completion.json` is written once semantically, or rewritten only with an identical result, and matches the emitted CLI result.

- id: I-002
  priority: P2
  severity: medium
  confidence: 0.9
  complexity: simple
  contract: B-009 Drive task selection compiles into a sequential graph
  files: missions/plans/durable-frontend-migration/plan.md, lib/driver/drive-graph-compiler.ts, tests/driver/drive-graph-compiler.test.ts
  lineRange: missions/plans/durable-frontend-migration/plan.md:164-170, missions/plans/durable-frontend-migration/plan.md:360-364, lib/driver/drive-graph-compiler.ts:104-120, tests/driver/drive-graph-compiler.test.ts:37-41
  summary: The plan declares that each drive task step after the first depends on the previous selected task (`spec.taskIds[i - 1]`), but the compiler sets later task steps to depend on the previous task-status finalizer. The executable test for B-009 codifies the implementation shape by expecting `TASK-10` to depend on `finalizer-task-status-TASK-30`, so the test does not verify the declared B-009 dependency contract.
  suggestedFix: Reconcile the graph contract and test. If the active plan remains authoritative, change the compiler so task steps depend on the previous selected task step and adjust finalizer dependencies separately; if finalizer-before-next-task ordering is the intended compatibility contract, revise the plan/behavior before treating this branch as satisfying B-009.
  task:
    title: Reconcile B-009 drive task dependency contract with compiler output
    labels: plan:durable-frontend-migration,drive,graph-contract
    acceptanceCriteria:
      1. The B-009 test asserts the same task-step dependency shape declared by the active plan.
      2. The compiler output and finalizer ordering tests both match the approved graph contract.
