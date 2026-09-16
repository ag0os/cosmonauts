---
id: TASK-688
title: Build source/runtime census collectors and explicit-root audit interface
status: To Do
priority: high
labels:
  - backend
  - testing
  - devops
  - 'plan:test-health-audit'
dependencies:
  - TASK-687
createdAt: '2026-09-16T18:34:28.459Z'
updatedAt: '2026-09-16T18:34:28.459Z'
---

## Description

Stage 2 — Census collectors.

Owned behavior: **B-002** (sole owner).

Implement the bounded TypeScript declaration collector, observation-only Vitest 3.2.4 reporter, reconciliation logic, and explicit-root CLI at the B-002 seams. Publish `docs/test-health-audit.md` v1 before reviewer stages and exclude generated audit JSON from Biome as D-024 requires. INV-003/INV-005/INV-006, AC-002/AC-003/AC-014, and D-006/D-011/D-018/D-024/D-025 are settled ground for this task: missing evidence never becomes clean, lifecycle phases are never guessed, and heuristic candidates remain separate from objective facts. Halt and escalate on collision rather than narrowing those promises.

<!-- AC:BEGIN -->
- [ ] #1 B-002 is proved at `scripts/test-health-audit/source-census.ts`, `runtime-reporter.ts`, `census.ts`, and `cli.ts` by `tests/scripts/test-health-audit/census.test.ts` > `reconciles all command surfaces and keeps unsupported or phase-unknown failures blocking`, carrying exact marker `@cosmo-behavior plan:test-health-audit#B-002` near the executable test.
- [ ] #2 Quality Contract assertion 2 is satisfied: fixtures cover source-only/runtime-only cases, aliases/nesting, parameter counts, skip/todo/filter/conditional states, collection/test/hook failures, unknown lifecycle phase, unsupported syntax, and command mismatch, and none can render clean evidence.
- [ ] #3 Reporter evidence preserves public payloads and labels a lifecycle phase objective only when Vitest establishes it; otherwise `phase: unknown`, basis `blocked`, and the limitation remain visible without heuristic overwrite.
- [ ] #4 The census/CLI distinguishes successful observation of a failing run or `incomplete`/`blocked` state from audit-tool failure, and records a reporter-clean non-zero post-run policy exit as command evidence/residual uncertainty rather than fabricating a collection or execution failure.
- [ ] #5 `docs/test-health-audit.md` documents the archive-safe command `bun scripts/test-health-audit/cli.ts --audit-root <path> <command>`, command exit contract, reviewer rubric, trust/consent boundary, rerun triggers, and explicit probe confirmation; no package script is added and `package.json` remains unchanged.
- [ ] #6 `biome.json` excludes `!missions/plans/*/audit/**`, preserving immutable digest-pinned generated evidence while leaving project-native lint applicable to maintained code and tests.
- [ ] #7 Dependency direction remains `cli/reporter/census/source-census -> schema`; census logic imports no product modules, and objective observations cannot populate human-reviewed role, authority, chain, criticality, disposition, or portfolio sufficiency.
<!-- AC:END -->
