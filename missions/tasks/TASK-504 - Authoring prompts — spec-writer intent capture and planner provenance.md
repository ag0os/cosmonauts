---
id: TASK-504
title: Authoring prompts — spec-writer intent capture and planner provenance
status: Done
priority: medium
assignee: claude-code
labels:
  - 'plan:spec-plan-intent'
  - documentation
dependencies:
  - TASK-502
createdAt: '2026-07-26T14:31:40.744Z'
updatedAt: '2026-07-26T14:38:29.089Z'
---

## Description

Stage 3 of plan spec-plan-intent (B-007, B-008). Spec-writer captures goal
and invariants into `## Intent` with INV-### IDs (distinct from narrative
Purpose, rankings stated where invariants conflict). Planner records
`Decided by:` provenance on every Decision Log entry and its sanity-check
confirms mechanisms that could collide with an invariant name which one
wins. Test-first against `tests/prompts/spec-writer.test.ts` and
`tests/prompts/planner.test.ts`.

<!-- AC:BEGIN -->
- [x] #1 B-007 spec-writer prompt captures goal and invariants in the intent section, with its named test and marker green
- [x] #2 B-008 planner prompt records decision provenance and checks mechanism against intent, with its named test and marker green
- [x] #3 Existing spec-writer and planner content tests stay green unmodified
<!-- AC:END -->

## Implementation Notes

Test-first. Spec-writer: Intent in the output section list + Detail-step distillation (goal, INV-### invariants, ranking, ratified-once-confirmed). Planner: Decided-by provenance sentence in the Decision Log discipline + fifth sanity check (Intent outranks mechanism). Existing tests untouched, 14/14 green.
