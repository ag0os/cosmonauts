---
id: TASK-746
title: Stage 6 test hardening - single-blocker verdict rows
status: Done
priority: medium
labels:
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-745
createdAt: '2026-09-24T15:17:50.262Z'
updatedAt: '2026-09-24T15:21:05.670Z'
---

## Description

Round 10 (`missions/plans/qm-chain-safety/mid-review-10-{codex,claude}.md`) gave SHIP for Stages 1–6 and found two LOW gaps in `tests/orchestration/quality-review-run.test.ts`. Each synthetic test row also carries a second, independent blocker, so neither row can fail on its own. This is a test-only change: no production change unless a test reveals a real defect, in which case stop and report it.

Run the suite as `env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test`. Keep the changed-scope audit against `main` passing.

<!-- AC:BEGIN -->
- [x] #1 The "never reports ready … analysis preparation failure" row mocks only the analysis-preparation call, so analysis preparation is its only blocker; removing the analysis-prep guard in `hostBlocksReady`/host items makes it fail (verified by a mutation probe noted in the task).
- [x] #2 The bound-failing-audit row commits its configuration into the base (configured checks and model), so the failing audit is its only blocker; removing the failing-audit block makes it fail (verified by a mutation probe noted in the task).
<!-- AC:END -->

## Implementation Notes

Mutation probes (temporary production edits, restored after each run): (1) Removed the analysisPreparationFailed human-item branch in preparationHumanItems, then ran env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test tests/orchestration/quality-review-run.test.ts --grep "never reports ready with a host human item from analysis preparation failure". Exit 1: the report became Verdict: ready and the expected analysis-preparation human item was absent. (2) Replaced the gateState !== "completed-bound" condition in hostBlocksReady with false, then ran env -u COSMONAUTS_DRIVER_CODEX_ARGS bun run test tests/orchestration/quality-review-run.test.ts --grep "reports a bound failing audit under gates and findings without a human item". Exit 1: expected Verdict: not-ready, received Verdict: ready. Unmutated focused rows and full suite pass (3267 tests); changed-scope audit against main passes. Production file has no remaining diff.
