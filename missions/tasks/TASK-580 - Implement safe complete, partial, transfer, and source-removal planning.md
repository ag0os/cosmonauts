---
id: TASK-580
title: 'Implement safe complete, partial, transfer, and source-removal planning'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:harness-adapters'
dependencies:
  - TASK-579
createdAt: '2026-08-25T23:03:32.468Z'
updatedAt: '2026-08-25T23:03:32.468Z'
---

## Description

Owns B-004 from AC-002 at Implementation Order step 4. Behavior seam: `lib/harness-adapters/types.ts`, `lib/harness-adapters/provenance.ts`, `lib/harness-adapters/sync.ts`, `lib/harness-runtime-inventory.ts`, `cli/harness/subcommand.ts`, and `cli/skills/subcommand.ts`; this task owns the core request/classification contract and `tests/harness-adapters/sync.test.ts`, while the later CLI-integration task wires the already-defined contract without taking B-004 ownership. AC-002, INV-002/INV-003, D-007, D-013, and D-016 are stop-and-escalate ground. No public operation may infer destructive work from incomplete or partial observation, and no live target or command is touched in Slice B.

<!-- AC:BEGIN -->
- [ ] #1 B-004/D-016: complete reconciliation aborts every selected-owner target/manifest write when any still-declared selected source root is incomplete.
- [ ] #2 B-004: with healthy source absence, complete reconciliation removes only unchanged invoking-owner outputs and entries, forgets orphan entries whose targets are absent, and preserves edited targets until an explicit manifest-only forget.
- [ ] #3 B-004/D-007: partial compatibility operations affect only explicitly selected assets; repeatable kind/asset filters isolate migrations, and named or `--all` skills export never infers removal of unselected, bundle, command, or stale-manifest entries.
- [ ] #4 B-004/D-013: the personal bundle and commands retain stable `authority:cosmonauts/core` ownership across second-project, checkout, monorepo, and package-path changes; project-derived assets retain project-realpath ownership.
- [ ] #5 B-004: project-owner transfer changes only an exact-baseline or absent target's matching manifest key with no pending journal; edited targets cannot transfer, and foreign-owner entries are never implicit source-removal candidates.
- [ ] #6 B-004/INV-002: forget and transfer paths never change target bytes, and every incomplete, edited, unselected, or foreign target remains byte/type/link-intact.
- [ ] #7 `tests/harness-adapters/sync.test.ts` contains `reconciles healthy complete partial transfer and source-removed inventories without destructive inference` with marker `@cosmo-behavior plan:harness-adapters#B-004` and covers every preceding exit.
<!-- AC:END -->
