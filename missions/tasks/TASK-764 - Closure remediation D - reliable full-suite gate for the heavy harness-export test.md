---
id: TASK-764
title: >-
  Closure remediation D - reliable full-suite gate for the heavy harness-export
  test
status: Done
priority: high
labels:
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-763
createdAt: '2026-09-24T22:21:46.613Z'
updatedAt: '2026-09-24T22:33:30.045Z'
---

## Description

The closure gates need a reliably green full suite (TASK-728 AC #4). One test, `tests/scripts/validate-harness-exports.test.ts` "validates evidence-held recovery for four repo exports before the personal bundle", takes about 5 s in isolation. The time is the same on `main` `29fc0ce` and on this branch, so the branch did not slow it down.

Under full-suite parallel load it exceeds the default 15 s test timeout. It failed in 3 of the last 4 full runs on this branch (15.5 s), and it failed once inside a real QM host check. The suite has grown by about 600 tests on this branch, which adds load.

Give the heavy tests in that file an explicit per-test timeout that fits their measured load profile. Allow at least 4x the observed loaded duration, for example 60 s. Do this in the test file only.

Do NOT change `vitest.config.ts`, `tests/setup.ts` or `scripts/vitest-runner.mjs`: they are gate-owned files. Do not change the test's assertions or behavior.

Check the other known load flakes (`cross-plan-commit-lock`, `plans/archive`, `extensions/project-tools`, `project-tools-fallow-fixtures`). Only if one of them also times out in the full suite here, apply the same treatment, and record which in the task notes.

Keep the changed-scope audit against `main` passing. Lint on tracked paths must pass.

<!-- AC:BEGIN -->
- [x] #1 The heavy test(s) in `tests/scripts/validate-harness-exports.test.ts` declare an explicit per-test timeout sized to their loaded duration, with assertions unchanged; no gate-owned file is edited.
- [x] #2 The full suite (`bun run test`) passes on two consecutive runs; the task notes record both results.
- [x] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck and tracked lint pass.
<!-- AC:END -->

## Implementation Notes

Worker verification, 2026-09-24: added a 60,000 ms per-test timeout only to the named heavy harness-export test; its assertions are unchanged. Focused file: 12/12 passed, target 5.150 s. Two consecutive full-suite runs in the repository test environment passed: run 1 = 261/261 files, 3432/3432 tests, 108.88 s (target 13.179 s); run 2 = 261/261 files, 3432/3432 tests, 96.95 s. The known load-sensitive files cross-plan-commit-lock, plans/archive, extensions/project-tools, and project-tools-fallow-fixtures passed in both qualifying runs, so no additional timeout was added. An earlier non-qualifying probe inherited the outer Drive workers COSMONAUTS_DRIVER_CODEX_ARGS and made fake-Codex tests fail; clearing that run-only injection made the focused driver tests pass and was used for the two qualifying suite runs. Fallow audit vs main with all three committed baselines: verdict pass, 0 dead-code issues, 0 complexity findings, 0 clone groups. Typecheck exited 0. Tracked Biome lint checked 599 files with no fixes.
