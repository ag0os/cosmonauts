---
id: TASK-305
title: Implement shared work-artifacts skill contract test-first
status: To Do
priority: high
labels:
  - testing
  - backend
  - 'plan:artifact-format-redesign'
dependencies: []
createdAt: '2026-05-21T21:30:37.531Z'
updatedAt: '2026-05-21T21:30:37.531Z'
---

## Description

Create the canonical shared `work-artifacts` skill and its reference set using the test-first text-contract style from the plan. Before editing any skill files, the worker must load `/skill:creating-skills` and read its `references/architecture.md` and `references/complex-skills.md` guidance for multi-reference dispatcher skills.

<!-- AC:BEGIN -->
- [ ] #1 B-001, B-002, B-007, B-008, B-011, B-015, and B-020 are covered by text-contract tests in `tests/prompts/work-artifacts-skill.test.ts`, with the matching `@cosmo-behavior plan:artifact-format-redesign#B-###` markers near executable tests.
- [ ] #2 `domains/shared/skills/work-artifacts/SKILL.md` is a thin dispatcher that directly links every required reference file and routes artifact-format questions to the right reference.
- [ ] #3 The `work-artifacts` references define workflow tiers, spec format, plan format, architecture format, behavior spine, gate contracts, visual primitives, and examples/templates without duplicating those rules in role skills.
- [ ] #4 Direct fixes are routed to lightweight TDD/regression-test guidance, while planned feature/refactor work is routed to `spec.md` plus behavior-first `plan.md`.
- [ ] #5 Quality Contract guidance is an ordered abstract gate ladder with binding states, tiers, protocol placeholder, explicit degradation for unbound bindable gates, and no concrete tool names or command columns.
- [ ] #6 Examples/templates exist for direct fix, tactical bugfix, planned feature/refactor, and architecture-linked multi-plan workflows, and approved visual primitives allow Mermaid/tables/lists/checklists while forbidding ASCII-art diagrams.
<!-- AC:END -->
