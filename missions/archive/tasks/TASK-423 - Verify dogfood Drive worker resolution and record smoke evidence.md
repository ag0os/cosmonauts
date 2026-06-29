---
id: TASK-423
title: Verify dogfood Drive worker resolution and record smoke evidence
status: Done
priority: medium
labels:
  - backend
  - testing
  - 'plan:coding-agnostic-framework'
dependencies:
  - TASK-413
  - TASK-416
createdAt: '2026-06-26T15:44:30.905Z'
updatedAt: '2026-06-29T18:29:13.975Z'
---

## Description

Prove dogfood Drive still resolves intended coding workers after default-domain and default-envelope changes, then record the bounded real smoke evidence. This task owns B-020 and B-021. Planned-behavior tests/evidence must include markers or artifact references for `@cosmo-behavior plan:coding-agnostic-framework#B-020` and `#B-021` as applicable.

<!-- AC:BEGIN -->
- [x] #1 B-020 the in-process Drive backend/spawner route resolves unqualified `worker` with no domain context to exactly `coding/worker`, and the test asserts `main` has no `worker` agent so the proof remains meaningful.
- [x] #2 B-020 automated proof exercises the existing spawner/Drive integration boundary far enough to prove the resolved qualified agent id, not merely the requested role string.
- [x] #3 B-021 `dogfood-drive-verification.md` records a bounded real Drive smoke with backend, command/tool invocation, run id, task id, and frozen framework default envelope path.
- [x] #4 B-021 dogfood evidence includes inspectable resolved-agent proof for `coding/worker` or the intended `coding/*` Drive worker; a run id alone is not accepted.
- [x] #5 Any new runtime spawn-resolution event is added only if existing artifacts cannot prove resolution, and the evidence notes the required human sign-off scope exception.
<!-- AC:END -->
