---
id: TASK-761
title: Stage 9 remediation A - QM tests leak workspaces into the system temp dir
status: Done
priority: medium
labels:
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-760
createdAt: '2026-09-24T21:34:08.787Z'
updatedAt: '2026-09-24T21:44:17.133Z'
---

## Description

Found by the coordinator during the TASK-728 closure.

Running `tests/orchestration/quality-review-run.test.ts` once leaves 5 `cosmonauts-qm-qm-*` workspace directories in `os.tmpdir()`. Measured with an isolated `TMPDIR`: the launch, workspace and named-entry test files leak 0. The developer machine had about 1,578 such directories after a day of suite runs. `runQualityReview` reserves `join(tmpdir(), "cosmonauts-qm-<runId>")`.

Some tests deliberately exercise a `retained` disposition, such as live work after a cancellation or a deadline, where production correctly keeps the workspace. Tests must still clean up everything they create (AGENTS.md: use temp directories for filesystem tests and clean up in `afterEach`).

Fix the tests, not the production retain semantics. Either point the QM's temp root at a per-test temp directory that is removed in `afterEach`, or remove the retained workspaces the tests create. Do not change production retention behavior or INV-003 evidence.

Keep the changed-scope audit against `main` passing: no new complexity, dead-code or duplication findings, no baseline change, no suppression. Lint on tracked paths must pass. Run the suite as `bun run test`.

<!-- AC:BEGIN -->
- [x] #1 Running `tests/orchestration/quality-review-run.test.ts` (and the full suite) with an isolated `TMPDIR` leaves no `cosmonauts-qm-*` directory behind; a check or test demonstrates this.
- [x] #2 Production workspace retention (retained on live work, removed otherwise) is unchanged; existing retention tests still pass and still assert the production disposition.
- [x] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck, tracked lint and the full suite pass.
<!-- AC:END -->
