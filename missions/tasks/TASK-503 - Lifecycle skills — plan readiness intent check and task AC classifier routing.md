---
id: TASK-503
title: Lifecycle skills — plan readiness intent check and task AC classifier routing
status: Done
priority: high
assignee: claude-code
labels:
  - 'plan:spec-plan-intent'
  - documentation
dependencies:
  - TASK-502
createdAt: '2026-07-26T14:31:40.742Z'
updatedAt: '2026-07-26T14:36:58.453Z'
---

## Description

Stage 2 of plan spec-plan-intent (B-005, B-006). `/skill:plan` readiness
check verifies Intent presence (spec when present, plan otherwise, per
D-001) and the lifecycle routes deviations to the deviation protocol.
`/skill:task` Common Problems entry for mid-implementation AC changes
routes through the classifier (ratified-restating ACs escalate; derived
ACs update on the record). Test-first against
`tests/prompts/plan-skill.test.ts` and `tests/prompts/task-skill.test.ts`.
Keep additions within the plan's ~12-line-per-file ceremony budget.

<!-- AC:BEGIN -->
- [x] #1 B-005 plan skill checks intent presence and routes deviations to the protocol, with its named test and marker green
- [x] #2 B-006 task skill routes mid-implementation AC changes through the deviation classifier, with its named test and marker green
- [x] #3 Existing plan-skill and task-skill content tests stay green unmodified
<!-- AC:END -->

## Implementation Notes

Test-first. Plan skill: Intent readiness bullet + Deviations And Amendments section (9 lines, within ceremony budget). Task skill: AC-change Common Problem now classifies first (ratified-restating -> halt-and-escalate; derived -> amend on record). Existing tests untouched, 13/13 green.
