# Review Report

base: origin/main
range: fbb84d2ab904f36c0bcc56575675df1c0fac1a6c..HEAD
overall: incorrect

## Overall Assessment

The durable-runtime scoped tests, full test suite, lint, and typecheck pass, but the scheduler still violates several Plan-3 safety contracts around unknown/retry handling and invalid persisted graph state. These are in-scope correctness issues for recovery and blocking semantics.

## Out-of-scope Changed Source Files

- bundled/coding/coding/prompts/fixer.md
- bundled/coding/coding/prompts/plan-reviewer.md
- bundled/coding/coding/prompts/planner.md
- bundled/coding/coding/prompts/quality-manager.md
- bundled/coding/coding/prompts/reviewer.md
- cli/drive/subcommand.ts
- lib/driver/README.md
- lib/driver/backends/orchestration-adapter.ts
- lib/driver/durable-events.ts
- lib/driver/durable-steps.ts
- lib/driver/event-stream.ts
- lib/driver/types.ts
- tests/cli/drive/run.test.ts
- tests/driver/backends/orchestration-adapter.test.ts
- tests/driver/driver-durable-steps.test.ts
- tests/driver/durable-events.test.ts
- tests/driver/durable-finalizers.test.ts
- tests/driver/durable-steps.test.ts

## Findings

- id: F-001
  priority: P2
  severity: medium
  confidence: 0.92
  complexity: simple
  title: "[P2] Block unknown outcomes before honoring retry"
  files: lib/durable-runtime/scheduler.ts
  lineRange: lib/durable-runtime/scheduler.ts:1417-1428
  summary: When a backend returns a `StepResult` with `outcome: "unknown"` and `nextAction: "retry"` while attempts remain, this branch requeues the step before the later unknown-result block runs. That violates B-008 and the D-006 unknown-vs-success rule for the retryable-unknown scenario, and can rerun ambiguous work instead of blocking for human recovery.
  evidence: `stepTransitionFromResult` checks `result.nextAction === "retry"` before checking `result.outcome === "unknown"`.
  suggestedFix: Classify `unknown`/ambiguous outcomes as blocked before retry handling, unless a separate explicit policy is added and tested for retrying unknown results.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Unknown results with `nextAction: "retry"` persist a blocked step/run and do not append a new attempt.
      2. Existing retry behavior for non-unknown retryable failures still appends the next attempt.

- id: F-002
  priority: P2
  severity: medium
  confidence: 0.9
  complexity: simple
  title: "[P2] Unregistered ready backends drain instead of blocking"
  files: lib/durable-runtime/scheduler.ts
  lineRange: lib/durable-runtime/scheduler.ts:201-212
  summary: For a ready step whose backend name is unknown or not registered in the scheduler backend map, the scheduler only returns an in-memory diagnostic with `exitReason: "drained"` and leaves the step ready/run running. In graphs produced with a missing adapter or default `unknown` backend, repeated scheduler starts will make no durable progress and no persisted blocked evidence, contrary to B-008/B-020 backend lookup rules.
  evidence: The `!backend` branch pushes `scheduler_backend_unavailable` and returns without writing a blocked `StepResult`, `step_blocked`, or `run_blocked` event.
  suggestedFix: Persist a blocked step result and terminal event for unavailable/unknown scheduler backends, then finalize the run if no other runnable work remains.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. A ready step with no registered scheduler backend becomes blocked with durable diagnostic evidence.
      2. Dependent steps are not marked ready and the run finalizes blocked when no other work can proceed.

- id: F-003
  priority: P2
  severity: medium
  confidence: 0.82
  complexity: simple
  title: "[P2] Invalid graph topology diagnostics are not blocking"
  files: lib/durable-runtime/file-store.ts, lib/durable-runtime/scheduler.ts
  lineRange: lib/durable-runtime/file-store.ts:170-188
  summary: If `graph.json` contains an invalid step or a step whose `runId` conflicts with the run, `readRunGraph` records a diagnostic and drops that graph node; the scheduler's blocking diagnostic check only covers missing/corrupt/invalid step records. With a corrupted persisted graph, recovery can silently ignore planned work or finalize from the remaining step records instead of blocking before execution, which weakens B-010/B-017/B-018 persisted-state recovery.
  evidence: `invalid_run_graph_step` and `graph_step_run_mismatch` are emitted while continuing, but `hasBlockingPersistedStateDiagnostics` only checks step-record diagnostic codes.
  suggestedFix: Treat invalid graph topology and graph/run conflicts as blocking recovery diagnostics before selecting work, preserving diagnostics in the event/diagnostic stream.
  task:
    title: -
    labels: -
    acceptanceCriteria:
      1. Invalid graph steps, graph run mismatches, and invalid edges block the scheduler before backend start.
      2. The run persists diagnostic evidence and does not silently drop graph nodes during recovery.

## Resolution (coordinator independent assessment)

- The `base: origin/main` line above is misleading: `origin/main` (fbb84d2) is
  19 commits behind local `main` (51f2e53), so the "Out-of-scope Changed Source
  Files" list is the already-merged Plan-1/Plan-2 work, NOT this branch.
  Against local `main`, `main...HEAD` touches only `lib/durable-runtime/*` and
  `tests/durable-runtime/*`. There is no out-of-scope change in Plan 3; that
  preliminary "blocker" was a stale-base false alarm.
- F-001 (block unknown before retry): not changed. The current behavior matches
  the plan's stated result-classification rule ("`outcome: unknown` -> blocked
  unless a retry remains") and `normalizeStepResult` already routes malformed
  reports to `wait_for_human` (which blocks). Left as-is by design.
- F-002 (unregistered/unknown backend drains): RESOLVED in commit
  `REVIEW-FIX: block unknown-backend + invalid-graph recovery`. A ready step
  whose backend name is the `unknown` sentinel now blocks durably
  (`blockUnknownBackendSteps` -> blocked StepResult + `step_blocked` +
  `run_blocked`). Scoped to the `unknown` name so a known backend absent from a
  single invocation's registry stays a recoverable ready/drain (preserves the
  B-003 readiness contract). Failing-first regression test:
  `tests/durable-runtime/graph-scheduler.test.ts` > "blocks a ready step
  durably when its backend is the unknown sentinel".
- F-003 (invalid graph topology not blocking): RESOLVED in the same commit.
  `hasBlockingPersistedStateDiagnostics` now treats `invalid_run_graph`,
  `invalid_run_graph_step`, `graph_step_run_mismatch`, and
  `invalid_run_graph_edge` as blocking (reusing the QM's
  `blockRunForPersistedStateDiagnostics`), so a corrupt `graph.json` blocks
  recovery before any backend start instead of silently dropping planned nodes.
  `ignored_graph_mutable_state` is intentionally excluded so the B-017
  graph-vs-step authority case still proceeds. Failing-first regression test:
  `tests/durable-runtime/scheduler-recovery.test.ts` > "blocks the run when
  graph topology is invalid instead of dropping graph nodes".
- Gates after resolution: `bun run test` 2309 pass; lint and typecheck clean;
  `cosmonauts plan check-artifacts durable-graph-scheduler` passes (20
  behaviors, 0 issues).
