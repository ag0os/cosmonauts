---
id: TASK-669
title: Plumb stage purposes through inline and durable prompt builders
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-668
createdAt: '2026-09-10T02:12:51.850Z'
updatedAt: '2026-09-10T02:12:51.850Z'
---

## Description

Implementation Order step 2. Owns behaviors B-001 and B-003 exclusively, and deliberately owns both prompt-building call sites in one landing: `lib/orchestration/chain-runner.ts` with `tests/orchestration/chain-runner.test.ts`, and `lib/orchestration/durable-chain-compiler.ts` with `tests/orchestration/chain-compiler.test.ts`. Extend the shared prompt-purpose seam established by TASK-668; do not land either call site without the other.

Recorded ground: D-001, D-002, D-008, and D-012 are derived and may change only through amend-on-record. The spec's step-0 context limit, two-call-site parity, and scope exclusions are ratified; needing arbitrary prior output, persona changes, public/factory-mode prompt configuration, or generic durable contract changes is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [ ] #1 B-001 is proven by `tests/orchestration/chain-runner.test.ts` > `gives a plan-review cycle distinct jobs while preserving the first planner prompt`, carrying `@cosmo-behavior plan:chain-stage-context#B-001`: the first planner retains today's prompt plus `User request:`, the reviewer adds only its terminal target-report contract, and the terminal planner receives the distinct highest-round revision and addressed-report job.
- [ ] #2 B-003 is proven by `tests/orchestration/chain-compiler.test.ts` > `compiles inline-equivalent purposes before converting to persisted step indexes`, carrying `@cosmo-behavior plan:chain-stage-context#B-003`: first, reviewer, and reviser prompts are byte-identical to inline strings at zero-based first/middle/terminal positions.
- [ ] #3 Both prompt-building call sites explicitly supply the same narrow `{ completionLabel, purpose }` contract and a bound correctness assertion proves byte-identical output for the same `(steps, zero-based index, stage)` triple.
- [ ] #4 The durable compiler derives purpose from the zero-based topology index before its existing `index + 1` persisted-step conversion; zero-based `topologyIndex` and one-based `stepIndex` remain distinct in names and values.
- [ ] #5 Purpose, zero-based topology position, expected plan identity, and later gate metadata remain chain-backend metadata only; `ChainStage`, `runStart`, scheduler/event contracts, generic durable `StepResult`/types, and `lib/domains/prompt-assembly.ts` remain unchanged.
- [ ] #6 Step-0-only request injection remains intact and neither call site transports arbitrary prior-stage prose or adds filesystem I/O to purpose derivation.
<!-- AC:END -->
