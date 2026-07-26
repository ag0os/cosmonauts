---
id: TASK-506
title: >-
  Evidence and archive — testing standards rule, supersession distillation,
  final gates
status: Done
priority: medium
assignee: claude-code
labels:
  - 'plan:spec-plan-intent'
  - documentation
  - testing
dependencies:
  - TASK-502
createdAt: '2026-07-26T14:31:40.747Z'
updatedAt: '2026-07-26T14:44:11.921Z'
---

## Description

Stage 5+6 of plan spec-plan-intent (B-013, B-014, AC-009). `docs/testing.md`
gains the evidence-integrity rule (a test asserting planned behavior
changes only after the plan text it proves, citing the decision) proved by
new `tests/docs/testing-standards.test.ts`. `/skill:archive` Key Decisions
extraction explicitly includes supersessions and amend-on-record decisions,
proved by new `tests/prompts/archive-skill.test.ts`. Then run the full
verification gates and the stack-agnostic sweep across every file the plan
touched.

<!-- AC:BEGIN -->
- [x] #1 B-013 testing standards state the evidence-integrity rule, with its named test and marker green
- [x] #2 B-014 archive skill distills supersessions and amend-on-record decisions, with its named test and marker green
- [x] #3 The project's test, lint, and type-check steps pass on the integrated change set
- [x] #4 Every touched shipped skill/prompt file is free of project-specific commands
<!-- AC:END -->

## Implementation Notes

Test-first. docs/testing.md gains Tests As Evidence (INV-4); archive skill distills supersessions/amend-on-record decisions. New test files tests/docs/testing-standards.test.ts + tests/prompts/archive-skill.test.ts. Final gates: 2743 tests green, lint clean, typecheck pass, check-artifacts 14 behaviors / 0 issues, stack-agnostic sweep clean across all 13 touched shipped files.
