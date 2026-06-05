---
source: archive
plan: durable-frontend-migration
distilledAt: 2026-06-04T22:00:00Z
---

# Durable Runtime Phase 4: Frontend Migration

## What Was Built
The wave-1 capstone of the durable orchestration track: Drive and chains now compile onto the **shared durable graph runtime** (`lib/durable-runtime`) instead of their bespoke loops. Two independently-shippable groups. **Group A (durable chain compiler):** loop-free chain DSL (`a->b`, `[a,b]`, `reviewer[3]`) folds into a `RunGraph` and runs through `runDurableGraphScheduler`; loop/completion-check stages stay on the legacy inline runner; `chain_run` and `-w/--workflow` route compile-or-inline. **Group B (Drive-on-graph):** the deferred Plan-3 B-020 bridge made real — Drive task runs compile to a graph (one task step per selected task + policy-gated finalizers) and execute through the scheduler with the current Drive CLI/tool surface, resume, finalization recovery, and detached frozen-runner safety all preserved. Behaviors B-001..B-022; combined suite 2339 green, artifact conformance 22/0.

## Key Decisions
- **Architecture X — scheduler-inside-frozen-child.** Detached Drive still spawns the run-level frozen `bin/cosmonauts-drive-step`; inside it, `run-step.ts` calls `runDriveOnGraph` so the in-process scheduler (D-010) runs *within* the frozen binary. This satisfies both D-010 and Scenario 5 (self-modifying host can't load mutated orchestration mid-run) without building the post-production generic per-step frozen runner. Inline runs the same entry in-host.
- **Task steps depend on the prior task's task-status finalizer, not the prior task.** `task[i].dependsOn = [finalizer-task-status-task[i-1]]` serializes backend→source-commit→task-status→next, preserving legacy per-task ordering. A direct task→task edge would let task N+1's backend start before task N's commit finalizers ran, interleaving commits.
- **The bridge is a real `RunGraphSchedulerBackend` over two axes.** The scheduler is hard-typed to `OrchestrationBackend<SchedulerStepInput, StepResult>`; the Drive adapter is `<BackendInvocation, BackendRunResult>` (a `@ts-expect-error` test pins non-assignability). `createDriveSchedulerBackend.prepare` builds the `BackendInvocation` (via `renderPromptForTask`); `start` runs preflight→backend→postflight→report-parse→**shared** D-006 inference→`StepResult`. Register only the *selected* backend + `shell-command`, not all three.
- **Drive-local partial marker.** partialMode "continue" must advance the graph yet keep the task `In Progress`. Encoded as a Drive-specific `ArtifactRef.kind` on the (scheduler-success) step result that `reportOutcomeFromStepResult` reads as "partial" — no change to the generic `StepResult` contract.
- **Two independent branches off main** (disjoint files: `lib/orchestration` + `cli/main.ts` vs `lib/driver` + `cli/drive`) so a Drive regression can't block the chain work; they merged conflict-free.

## Patterns Established
- **Single terminal CLI result on resume.** Route graph-backed resumes through `runDriveOnGraph` for the one authoritative `DriverResult`; do NOT print/write an interim completion inside pending-finalization retry (that path emitted a second, inconsistent completion).
- **finalization_failed maps from PERSISTED evidence, not a live `nextAction`.** Finalizer steps carry an explicit retry policy so a `nextAction:"retry"` survives the scheduler's blocked-normalization; `runDriveOnGraph.readRetryableDriveFinalizerFailure` reconstructs the `finalization_failed` `DriverResult` (with the real completed-task count) from the persisted `StepRecord`/attempt + `pending-finalization.json`.
- **graph-activity-only event sink mode.** The scheduler owns normalized lifecycle (`orchestration-events.jsonl`); the legacy `DriveStepProjector` is disabled for graph runs; legacy `events.jsonl` + bus events still feed `watch_events`. No duplicate normalized lifecycle.
- **Share legacy finalization, don't fork it.** `lib/driver/drive-finalization.ts` holds the source-commit/task-status/state-commit helpers used by BOTH `run-one-task.ts`/`state-commit.ts` (legacy) and the `shell-command` finalizer; legacy callers delegate with no behavior change.
- **Inline-fallback predicate for chains:** `hasLoop = steps.some(s => !isParallelGroupStep(s) && s.loop)` plus any `completionCheck`/`completionLabel` → legacy inline; everything else compiles. No parser change.

## Files Changed
- New (Group A): `lib/orchestration/{durable-chain-compiler,durable-chain-runner,chain-scheduler-backend,chain-event-adapter,stage-prompts}.ts`; wired into `chain-tool.ts` + `cli/main.ts handleWorkflowMode`.
- New (Group B): `lib/driver/{drive-graph-compiler,drive-graph-runner,drive-scheduler-backend,shell-command-finalizer,drive-finalization}.ts`.
- Edited (Group B): `lib/driver/{driver,run-step,run-one-task,state-commit,event-stream,types}.ts`, `cli/drive/subcommand.ts`, `domains/shared/extensions/orchestration/{driver-tool,watch-events-tool}.ts`.
- `runRunLoop` retained as the legacy/debug inline path; `bin/` untouched (the frozen binary is compiled at runtime from `run-step.ts`).

## Gotchas & Lessons
- **The clean-context review pays off on non-happy paths.** A 2300+ happy-path suite still missed five real regressions surfaced by the QM + integration-verifier: partial-continue marking tasks Done, duplicate state-commit `run_finalization_failed`, `finalization_failed` hard-coding `tasksDone:0`, dropped contradicted-block self-retry, and resume emitting two `DriverResult` JSON objects. Run the adversarial review and **independently re-verify each finding with a failing-first test** — the QM raises real findings but applies no fixes.
- **`finalization_failed` must report the real completed-task count** (count completed `finalizer-task-status-*` steps), never 0 — a late finalization failure otherwise looks like nothing completed.
- **`check-artifacts` only fully passes when both groups' tests coexist** on one branch (each branch carries only its group's test files). Prove the combined green/conformance on a throwaway merge before handoff.
- **Validate Drive-on-graph against a REAL run**, not just fixtures: a detached `cosmonauts drive run --commit-policy no-commit` confirmed the graph compiled, the frozen child ran the scheduler, finalizers were policy-gated, and `drive status` classified correctly — integration bugs that fakes hide.
- The dependency-model refinement (finalizer-before-next-task) was discovered while wiring `runDriveOnGraph`, not at compile-design time — executable graphs expose ordering the reactive projector didn't.
