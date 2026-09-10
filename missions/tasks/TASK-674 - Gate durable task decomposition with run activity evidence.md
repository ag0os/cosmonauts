---
id: TASK-674
title: Gate durable task decomposition with run activity evidence
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-673
createdAt: '2026-09-10T02:14:55.997Z'
updatedAt: '2026-09-10T18:00:00.000Z'
---

## Description

Implementation Order step 7. Owns behavior B-010 exclusively. Complete loop-free durable review/task execution in `lib/orchestration/durable-chain-runner.ts`, consume/project its evidence in `lib/orchestration/chain-event-adapter.ts`, and use the chain-backend metadata from TASK-669. Prove the backend path in `tests/orchestration/run-start-chain-characterization.test.ts` and adapter projection in `tests/orchestration/chain-event-adapter.test.ts`.

Recorded ground: D-007, D-009, and D-010 are derived and may change only through amend-on-record. The ratified scope excludes `runStart`, scheduler, drive-envelope, and generic durable contract changes. `step_tool_activity` is explicitly rejected; any need for it, a second runtime, dependency rewrites, or changed generic `StepResult`/event types is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [ ] #1 B-010 is proven by `tests/orchestration/run-start-chain-characterization.test.ts` > `gates durable task decomposition on earlier reviewer-bound addressed activity`, carrying `@cosmo-behavior plan:chain-stage-context#B-010`, across loop-free sequential and parallel shapes, both sibling scheduling orders, and activity-before-terminal-result interruption.
- [ ] #2 Existing `run_activity` persists chain-local `plan_review_target`, `plan_review_addressed` with zero-based source topology index, and `unaddressed_review_round` block details; `step_tool_activity` remains agent tool/session evidence and is not used for review gating.
- [ ] #3 Reviewer target activity is durable before reviewer success, valid revision addressed activity is durable before revision success, and guarded task-manager backends read persisted evidence before invoking their spawner.
- [ ] #4 A durable task-manager starts only when the current target has matching addressed evidence from a strictly lower topology index and ordinary dependencies are satisfied; same-index evidence, either sibling order, missing target, and partial-persistence states never authorize it.
- [ ] #5 Every durable unaddressed path records block activity and returns the existing blocked outcome with `nextAction: "wait_for_human"`; unresolved predecessor status remains scheduling authority and the reconstructed run ends blocked rather than silently succeeding.
- [ ] #6 The chain event adapter structurally validates durable block activity and projects the typed chain event with stable nonempty error evidence, including across partial result persistence.
- [ ] #7 Inline and durable paths reuse one purpose/report/round/masking implementation, while `runStart`, scheduler, dependency semantics, generic `lib/durable-runtime/*` types/events/`StepResult`, and plan persistence remain unchanged.
- [ ] #8 D-013.3: `plan_review_addressed` details carry `producerStepId` and `producerRole` alongside target and zero-based `topologyIndex`, and the guard validates the detail shape explicitly rather than consuming `run_activity.details` as `unknown`. Because `run_activity` is typed `{ runId, details: unknown }` with no `stepId`, and `FileRunStore.isStoredEvent` validates only the envelope, a self-reported index is an unverified claim.
- [ ] #9 The guard correlates the producer before authorizing: `producerStepId` must name the graph step at the claimed `topologyIndex`, that step must carry plan-revision purpose in its chain-local metadata, and it must have completed successfully. Mandatory negative tests cover a wrong-producer step id, a producer whose real index differs from the claimed one, a producer that did not complete successfully, and structurally malformed details — each makes zero task-manager spawns and emits the typed block.
- [ ] #10 D-013.2 applies durably as well: the guard re-runs the TASK-670 assessment for the bound slug before spawning and blocks a superseded round as `stale-addressed-evidence`, so inline and durable share one freshness rule.
- [ ] #11 Both correlation fields remain inside chain-local activity details; the generic `OrchestrationEvent` union, `StepResult`, scheduler, and `runStart` contracts stay unchanged.
<!-- AC:END -->
