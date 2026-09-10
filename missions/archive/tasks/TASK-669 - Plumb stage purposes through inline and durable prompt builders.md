---
id: TASK-669
title: Plumb stage purposes through inline and durable prompt builders
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-668
createdAt: '2026-09-10T02:12:51.850Z'
updatedAt: '2026-09-10T18:03:07.680Z'
---

## Description

Implementation Order step 2. Owns behaviors B-001 and B-003 exclusively, and deliberately owns both prompt-building call sites in one landing: `lib/orchestration/chain-runner.ts` with `tests/orchestration/chain-runner.test.ts`, and `lib/orchestration/durable-chain-compiler.ts` with `tests/orchestration/chain-compiler.test.ts`. Extend the shared prompt-purpose seam established by TASK-668; do not land either call site without the other.

Recorded ground: D-001, D-002, D-008, and D-012 are derived and may change only through amend-on-record. The spec's step-0 context limit, two-call-site parity, and scope exclusions are ratified; needing arbitrary prior output, persona changes, public/factory-mode prompt configuration, or generic durable contract changes is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [x] #1 B-001 is proven by `tests/orchestration/chain-runner.test.ts` > `gives a plan-review cycle distinct jobs while preserving the first planner prompt`, carrying `@cosmo-behavior plan:chain-stage-context#B-001`: the first planner retains today's prompt plus `User request:`, the reviewer adds only its terminal target-report contract, and the terminal planner receives the distinct highest-round revision and addressed-report job.
- [x] #2 B-003 is proven by `tests/orchestration/chain-compiler.test.ts` > `compiles inline-equivalent purposes before converting to persisted step indexes`, carrying `@cosmo-behavior plan:chain-stage-context#B-003`: first, reviewer, and reviser prompts are byte-identical to inline strings at zero-based first/middle/terminal positions.
- [x] #3 Both prompt-building call sites explicitly supply the same narrow `{ completionLabel, purpose }` contract and a bound correctness assertion proves byte-identical output for the same `(steps, zero-based index, stage)` triple.
- [x] #4 The durable compiler derives purpose from the zero-based topology index before its existing `index + 1` persisted-step conversion; zero-based `topologyIndex` and one-based `stepIndex` remain distinct in names and values.
- [x] #5 Purpose, zero-based topology position, expected plan identity, and later gate metadata remain chain-backend metadata only; `ChainStage`, `runStart`, scheduler/event contracts, generic durable `StepResult`/types, and `lib/domains/prompt-assembly.ts` remain unchanged.
- [x] #6 Step-0-only request injection remains intact and neither call site transports arbitrary prior-stage prose or adds filesystem I/O to purpose derivation.
- [x] #7 The two wire tokens fixed by D-005 — `COSMO_PLAN_REVIEW` for the reviewer target report and `COSMO_REVIEW_REVISION` for the reviser addressed report — are declared once as shared exported constants, and the instruction text this task emits references those constants rather than restating the tokens as prose. The literal strings appear in exactly one source location each.
- [x] #8 A round-trip test proves the producer and the consumer cannot drift: for each token, the instruction text emitted here is parsed by the same grammar `lib/orchestration/review-revision.ts` will accept (TASK-671/TASK-672), and a mutation to either the emitted token or the accepted token fails the test. Emitting an instruction naming a token no parser accepts is a defect, not a documentation gap.
- [x] #9 D-013.1 is implemented as one shared composer, `appendBoundReviewTarget(prompt, target)`, which appends a single bounded line naming only the plan slug and review round to plan-revision and guarded task-decomposition stages, and returns the prompt unchanged when no target is bound. It transports no reviewer prose and no prior-stage output.
- [x] #10 The bound-target suffix is resolved at step start, not at compile time: inline supplies it from run-local state and durable supplies it from the persisted `plan_review_target` activity, because durable compilation completes before the reviewer runs and `plan-and-build` creates its plan mid-run. A test proves a durable stage whose prompt was compiled before any target existed still receives the correct suffix at step start.
- [x] #11 B-003 parity is asserted twice and separately — once over compile-time purpose text and once over the runtime bound-target suffix — and AC #3's byte-identity assertion continues to hold for the unbound case, so every prompt asserted byte-identical under B-004 stays byte-identical.
<!-- AC:END -->
