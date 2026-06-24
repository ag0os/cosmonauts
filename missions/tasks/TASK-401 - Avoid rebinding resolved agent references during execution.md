---
id: TASK-401
title: Avoid rebinding resolved agent references during execution
status: Done
priority: medium
assignee: worker
labels:
  - review-fix
  - 'review-round:3'
  - domains
  - orchestration
  - bindings
  - 'plan:domain-authoring'
dependencies: []
createdAt: '2026-06-24T15:21:27.730Z'
updatedAt: '2026-06-24T15:26:18.267Z'
---

## Description

Round-2 reviewer finding F-006 for plan domain-authoring. Spawn execution uses `config.agentReference.resolved.qualifiedId` as the execution role, then calls the binding-aware registry again. If config binds `a -> b` and also binds `b -> c`, resolving `a/worker` records `b/worker`, but the later lookup can re-apply `b -> c` and spawn `c/worker` or fail, making execution inconsistent with the stored resolved reference. Implement the narrowest fix so already-resolved references are treated as final execution targets across direct spawn, chain, and durable-chain spawn paths.

<!-- AC:BEGIN -->
- [x] #1 A resolved agent reference is treated as the final execution target even when the target role has its own binding.
- [x] #2 Direct spawn execution does not rebind `agentReference.resolved.qualifiedId`.
- [x] #3 Chain and durable-chain spawn paths use the same non-rebinding lookup behavior.
- [x] #4 Regression tests cover chained bindings such as `a -> b` and `b -> c` and prove execution uses `b/worker` for a previously resolved `a/worker` reference.
<!-- AC:END -->

## Implementation Notes

Implemented non-rebinding resolved-target lookup for agent execution. Direct spawns now use the already resolved qualified agent target as final, and chain preflight uses the same resolved-target lookup before passing spawn configs through to direct/durable execution. Added regression coverage for chained bindings a -> b and b -> c across direct spawn, inline chain stage execution, and durable chain compilation. Verification passed: targeted orchestration tests, bun run lint, bun run typecheck, bun run test.
