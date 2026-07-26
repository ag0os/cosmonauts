---
id: TASK-503
title: Lifecycle skills — plan readiness intent check and task AC classifier routing
status: To Do
priority: high
labels:
  - 'plan:spec-plan-intent'
  - documentation
dependencies:
  - TASK-502
createdAt: '2026-07-26T14:31:40.742Z'
updatedAt: '2026-07-26T14:31:53.381Z'
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
- [ ] #1 B-005 plan skill checks intent presence and routes deviations to the protocol, with its named test and marker green
- [ ] #2 B-006 task skill routes mid-implementation AC changes through the deviation classifier, with its named test and marker green
- [ ] #3 Existing plan-skill and task-skill content tests stay green unmodified
<!-- AC:END -->
