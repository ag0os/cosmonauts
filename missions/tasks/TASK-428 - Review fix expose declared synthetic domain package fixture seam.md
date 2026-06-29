---
id: TASK-428
title: 'Review fix: expose declared synthetic domain package fixture seam'
status: Done
priority: medium
assignee: worker
labels:
  - review-fix
  - 'review-round:2'
  - testing
  - 'plan:coding-agnostic-framework'
dependencies: []
createdAt: '2026-06-29T18:58:10.403Z'
updatedAt: '2026-06-29T19:02:58.750Z'
---

## Description

Integration verifier finding I-002: the behavior of the synthetic installable package helper exists in `tests/helpers/packages.ts`, but the plan declared the reusable seam as `tests/helpers/domain-package-fixture.ts` with `writeSyntheticDomainPackage(...)` / `writeProjectInstalledDomainPackage(...)` and B-014 coverage in `tests/helpers/domain-package-fixture.test.ts`. Add the declared seam (thin wrappers are fine if clear) or update the contract in a way that preserves future Wave 2 consumers.

<!-- AC:BEGIN -->
- [x] #1 `tests/helpers/domain-package-fixture.ts` exposes the declared synthetic package fixture API or the plan/spec are explicitly revised to the implemented seam.
- [x] #2 B-014 test coverage exercises the declared seam through package scanner/domain loader behavior, preferably in `tests/helpers/domain-package-fixture.test.ts` or with clear plan-aligned naming.
- [x] #3 Existing Bucket B tests continue using synthetic packages rather than real bundled coding where required.
- [x] #4 `bun run typecheck`, `bun run lint`, and relevant tests pass.
<!-- AC:END -->

## Implementation Notes

Implemented declared `tests/helpers/domain-package-fixture.ts` seam as thin wrappers exposing `writeSyntheticDomainPackage(...)` and `writeProjectInstalledDomainPackage(...)`; added B-014 coverage in `tests/helpers/domain-package-fixture.test.ts` through scanner/loader behavior; repointed current synthetic-package Bucket B consumers to the declared seam; updated the decoupling ledger for the new coding-reference test file. Verification: `bun run typecheck` passed; `bun run lint` passed; relevant test set passed (`bun run test tests/helpers/domain-package-fixture.test.ts tests/helpers/packages.test.ts tests/domains/main-domain.test.ts tests/cli/dump-prompt.test.ts tests/orchestration/agent-spawner.spawn.test.ts tests/orchestration/agent-spawner.completion-loop.test.ts tests/extensions/orchestration.test.ts`); `bun run test tests/coding-agnostic-fixtures.test.ts tests/helpers/domain-package-fixture.test.ts` passed; full `bun run test` was attempted and hit a transient B-021 assertion in `tests/driver/backends/cosmonauts-subagent-resolution.test.ts`, which passed when rerun directly.
