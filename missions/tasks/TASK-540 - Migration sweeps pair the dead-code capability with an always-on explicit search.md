---
id: TASK-540
title: >-
  Migration sweeps pair the dead-code capability with an always-on explicit
  search
status: Done
priority: medium
labels:
  - 'plan:analysis-gate-rewiring'
  - backend
dependencies:
  - TASK-538
createdAt: '2026-07-30T16:29:50.582Z'
updatedAt: '2026-07-30T17:09:33.053Z'
---

## Description

Stage 4 of `missions/plans/analysis-gate-rewiring/plan.md`, for the
migration sweep. Read the migration paragraph of Design section 2 and
AC-011 first.

Both the Worker's pre-completion sweep and the Quality Manager's
migration-shaped stale-reference requirement gain the bound dead-code
capability as ADDITIVE evidence. The explicit old-identifier/path search
across runtime source, tests, and docs stays unconditional: structural
reachability cannot prove a stale string absent.

This is the only worker-prompt change in this slice. Worker's
trace-before-delete and audit-at-task-close procedure belongs to
`analysis-investigation-procedures` (B-022) — do not write it here.

Ratified ground: AC-011 requires no regression against what the Quality
Manager sees today, so removing or weakening the explicit search is a
regression, not a simplification. INV-1 governs both prompts.

Gate kinds: `correctness` (hard fail), `artifact-conformance` (hard fail),
`dead-code` (bound). Record the commit HEAD at task start; that SHA is the
changed-scope base for any audit at task close.

<!-- AC:BEGIN -->
- [x] #1 `B-031` — `tests/prompts/quality-manager.test.ts` > `preserves explicit migration reference searches even when dead code is bound` proves both `bundled/coding/prompts/worker.md` and `bundled/coding/prompts/quality-manager.md` instruct running the dead-code capability when bound AND always running the explicit old-identifier/path search across runtime source, tests, and docs.
- [x] #2 The test proves the explicit search is unconditional — a bound dead-code capability does not make it optional — and both prompts state why: structural reachability cannot prove stale strings absent.
- [x] #3 The worker's existing runtime-source-first sweep ordering and its rule that a tests/docs-only sweep is not sufficient survive unchanged.
- [x] #4 Neither prompt names a provider or a command for the capability half (`INV-1`).
- [x] #5 The TASK-537 Quality Manager migration-sweep characterization still passes, the test carries `@cosmo-behavior plan:analysis-gate-rewiring#B-031` near the executable test, and the project's test, lint, and type-check steps pass.
<!-- AC:END -->
