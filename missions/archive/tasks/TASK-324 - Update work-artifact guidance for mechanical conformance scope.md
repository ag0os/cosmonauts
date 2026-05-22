---
id: TASK-324
title: Update work-artifact guidance for mechanical conformance scope
status: Done
priority: medium
labels:
  - testing
  - 'plan:artifact-conformance-gate'
dependencies:
  - TASK-322
createdAt: '2026-05-22T15:56:08.878Z'
updatedAt: '2026-05-22T16:33:32.883Z'
---

## Description

Narrowly update work-artifact markdown guidance after the checker behavior exists. Owns seams `domains/shared/skills/work-artifacts/references/behavior-spine.md`, `domains/shared/skills/work-artifacts/references/gate-contracts.md`, optional `domains/shared/skills/work-artifacts/references/plan-format.md`, and `tests/prompts/work-artifacts-skill.test.ts`. Test must carry marker `@cosmo-behavior plan:artifact-conformance-gate#B-012`. Source AC: AC-010. Named test: `mentions mechanical behavior marker conformance without requiring AST parsing gate bindings or legacy migration`.

<!-- AC:BEGIN -->
- [ ] #1 B-012 / AC-010: Guidance states that mechanical conformance checks required behavior fields, root-relative test files, and exact marker presence.
- [ ] #2 B-012 / AC-010: Guidance explicitly preserves v1 exclusions: no AST parsing, marker proximity checking, concrete gate bindings, Quality Contract runner, broad workflow-tier enforcement, or legacy migration.
- [ ] #3 B-012 / AC-010: Guidance states older plans missing current behavior-spine fields may fail until migrated separately.
- [ ] #4 B-012 / AC-010: Gate-contract wording moves away from future-tense “once enforcement exists” for artifact conformance while keeping generic artifact references abstract and free of concrete command/tool columns or project-specific bindings.
- [ ] #5 The named prompt/skill text-contract test for B-012 passes and includes the required `@cosmo-behavior` marker.
<!-- AC:END -->
