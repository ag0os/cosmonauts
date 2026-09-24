---
id: TASK-764
title: >-
  Closure remediation D - reliable full-suite gate for the heavy harness-export
  test
status: To Do
priority: high
labels:
  - testing
  - 'plan:qm-chain-safety'
  - remediation
dependencies:
  - TASK-763
createdAt: '2026-09-24T22:21:46.613Z'
updatedAt: '2026-09-24T22:21:46.613Z'
---

## Description

The closure gates need a reliably green full suite (TASK-728 AC #4). One test, `tests/scripts/validate-harness-exports.test.ts` "validates evidence-held recovery for four repo exports before the personal bundle", takes about 5 s in isolation. The time is the same on `main` `29fc0ce` and on this branch, so the branch did not slow it down.

Under full-suite parallel load it exceeds the default 15 s test timeout. It failed in 3 of the last 4 full runs on this branch (15.5 s), and it failed once inside a real QM host check. The suite has grown by about 600 tests on this branch, which adds load.

Give the heavy tests in that file an explicit per-test timeout that fits their measured load profile. Allow at least 4x the observed loaded duration, for example 60 s. Do this in the test file only.

Do NOT change `vitest.config.ts`, `tests/setup.ts` or `scripts/vitest-runner.mjs`: they are gate-owned files. Do not change the test's assertions or behavior.

Check the other known load flakes (`cross-plan-commit-lock`, `plans/archive`, `extensions/project-tools`, `project-tools-fallow-fixtures`). Only if one of them also times out in the full suite here, apply the same treatment, and record which in the task notes.

Keep the changed-scope audit against `main` passing. Lint on tracked paths must pass.


<!-- AC:BEGIN -->
- [ ] #1 The heavy test(s) in `tests/scripts/validate-harness-exports.test.ts` declare an explicit per-test timeout sized to their loaded duration, with assertions unchanged; no gate-owned file is edited.
- [ ] #2 The full suite (`bun run test`) passes on two consecutive runs; the task notes record both results.
- [ ] #3 The changed-scope audit against `main` with committed baselines still passes; typecheck and tracked lint pass.
<!-- AC:END -->
