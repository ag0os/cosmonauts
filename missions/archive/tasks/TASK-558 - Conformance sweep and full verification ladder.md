---
id: TASK-558
title: Conformance sweep and full verification ladder
status: Done
priority: high
labels:
  - 'plan:drive-process-reaping'
dependencies:
  - TASK-556
  - TASK-557
createdAt: '2026-08-10T18:47:50.219Z'
updatedAt: '2026-08-10T19:48:41.162Z'
---

## Description

Close the plan. Seven plans seam behaviours to lib/driver/driver.ts:
drive-resilience-state-model, durable-backend-step-model,
durable-frontend-migration, durable-run-store-events, episodic-log,
episodic-log-detached-hardening, orchestration-surface-consolidation.

`plan check-artifacts` now resolves archived plans too, so all seven are
checkable. Then run the ladder and an independent review.

<!-- AC:BEGIN -->
- [ ] #1 bun bin/cosmonauts plan check-artifacts is clean for drive-process-reaping (B-001..B-005 all paired) and for all seven driver-seamed plans.
- [ ] #2 bun run test, bun run lint, bun run typecheck all green.
- [ ] #3 ps checked deliberately after the suite: no codex/fake-backend/sleep process survives it. A green suite alone is not accepted as evidence.
- [ ] #4 An independent review (/skill:codex-review, framed as correctness/liveness) has been run, its findings fixed, and a re-review run afterwards - review fixes reliably introduce new defects in this repo.
- [ ] #5 missions/tasks/config.json is not committed with whitespace churn, and its biome.json:8 exclusion is intact.
<!-- AC:END -->
