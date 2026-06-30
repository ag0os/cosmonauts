---
id: TASK-427
title: 'Review fix: produce actual B-021 plan-linked Drive smoke evidence'
status: Done
priority: high
assignee: worker
labels:
  - review-fix
  - 'review-round:2'
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-29T18:58:02.659Z'
updatedAt: '2026-06-29T19:05:13.683Z'
---

## Description

Integration verifier finding I-001: B-021 remains unsatisfied because `dogfood-drive-verification.md` cites a mocked executable test/local TASK-001 rather than an actual plan-linked Drive smoke. Produce/record a real plan-linked Drive run with backend `cosmonauts-subagent`, omitted `envelopePath`, no project domain override, and inspectable resolved-agent proof for `coding/worker`. If current runtime artifacts do not expose the resolved id, add the smallest observable event/session marker needed at the spawn/Drive seam and cover it with tests.

<!-- AC:BEGIN -->
- [x] #1 A real plan-linked Drive smoke is run with backend `cosmonauts-subagent`, omitted `envelopePath`, and no project domain override; the recorded task id is a plan-labeled task, not a test-local fixture id.
- [x] #2 `dogfood-drive-verification.md` records the tool/command invocation, run id, task id, backend, frozen framework default envelope path, and durable event/transcript/session evidence proving the spawned worker resolved to `coding/worker`.
- [x] #3 If needed, runtime/test coverage adds the minimal resolved-agent observability at the existing spawner/Drive seam without changing agent resolution behavior.
- [x] #4 The previous mocked test remains allowed as B-020 seam coverage but is not presented as the actual B-021 smoke.
- [x] #5 Targeted Drive/spawner tests plus `bun run typecheck`, `bun run lint`, and relevant tests pass.
<!-- AC:END -->

## Implementation Notes

Implemented minimal resolved-agent observability at the spawner/Drive seam: `agent_resolved` includes requested role and resolved qualified agent id and is mapped into Drive activity/events. Ran real B-021 smoke `run-c8424c9c-4db0-4261-b35e-680faf89aa2e` on plan-labeled `TASK-427` with backend `cosmonauts-subagent`, omitted `--envelope`, no project domain override; durable events record `requestedRole: worker`, `resolvedAgentId: coding/worker`. Verification: `bun run test tests/driver/backends/cosmonauts-subagent-resolution.test.ts tests/orchestration/agent-spawner.spawn.test.ts`, `bun run typecheck`, `bun run lint` pass.
