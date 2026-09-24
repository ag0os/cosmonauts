---
id: TASK-746
title: Stage 6 test hardening - single-blocker verdict rows
status: To Do
priority: medium
labels:
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-745
createdAt: '2026-09-24T15:17:50.262Z'
updatedAt: '2026-09-24T15:17:50.262Z'
---

## Description

Round 10 (`missions/plans/qm-chain-safety/mid-review-10-{codex,claude}.md`) gave SHIP for Stages 1–6 and found two LOW gaps in `tests/orchestration/quality-review-run.test.ts`. Each synthetic test row also carries a second, independent blocker, so neither row can fail on its own. This is a test-only change: no production change unless a test reveals a real defect, in which case stop and report it.

Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. Keep the changed-scope audit against `main` passing.


<!-- AC:BEGIN -->
- [ ] #1 The "never reports ready … analysis preparation failure" row mocks only the analysis-preparation call, so analysis preparation is its only blocker; removing the analysis-prep guard in `hostBlocksReady`/host items makes it fail (verified by a mutation probe noted in the task).
- [ ] #2 The bound-failing-audit row commits its configuration into the base (configured checks and model), so the failing audit is its only blocker; removing the failing-audit block makes it fail (verified by a mutation probe noted in the task).
<!-- AC:END -->
