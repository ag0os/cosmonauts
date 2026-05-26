---
id: TASK-329
title: Resolve and propagate Drive state commit policy consistently
status: To Do
priority: high
labels:
  - backend
  - api
  - testing
  - 'plan:drive-resilience-state-model'
dependencies:
  - TASK-326
createdAt: '2026-05-22T19:57:34.994Z'
updatedAt: '2026-05-22T19:57:34.994Z'
---

## Description

Add the shared state commit policy contract and propagate it through user-facing frontends without duplicating defaults. Owns B-013 from source AC-011 and supports later final state commit work. Seams: `lib/driver/types.ts`, `cli/drive/subcommand.ts`, `domains/shared/extensions/orchestration/driver-tool.ts`, `lib/driver/prompt-template.ts`. Named tests: `tests/cli/drive/run.test.ts` > `defaults state commit policy from commit policy`; `tests/extensions/orchestration-driver-tool.test.ts` > `run_driver propagates state commit policy defaults and overrides`; plus `tests/driver/prompt-template.test.ts` state commit policy rendering coverage. Tests proving B-013 must carry marker `@cosmo-behavior plan:drive-resilience-state-model#B-013`.

<!-- AC:BEGIN -->
- [ ] #1 B-013: Driver core resolves `stateCommitPolicy` to `final-state-commit` when `commitPolicy=driver-commits` and to `none` otherwise unless an explicit override is provided.
- [ ] #2 B-013: CLI Drive run creation accepts and propagates an optional state commit policy while relying on the shared core resolver for defaults.
- [ ] #3 B-013: Pi `run_driver` accepts and propagates optional state commit policy overrides and observes the same default behavior as CLI runs.
- [ ] #4 Prompt rendering exposes the resolved state commit policy expectations without changing the backend report contract.
- [ ] #5 No frontend computes divergent state commit policy defaults outside the shared driver-core resolver.
<!-- AC:END -->
