---
id: TASK-505
title: >-
  Implementing and reviewing prompts — worker, quality-manager, plan-reviewer,
  task-manager
status: Done
priority: high
assignee: claude-code
labels:
  - 'plan:spec-plan-intent'
  - documentation
dependencies:
  - TASK-502
createdAt: '2026-07-26T14:31:40.745Z'
updatedAt: '2026-07-26T14:40:41.661Z'
---

## Description

Stage 4 of plan spec-plan-intent (B-009..B-012), the two channels real
deviations flow through. Worker routes collisions through the classifier
(escalation = Blocked + drafted decision entry; "reasonable decision"
scoped to ground the classifier leaves to it; amendments surfaced by
decision ID). Quality-manager treats findings as evidence, classifies each
remediation against ratified ground before routing, sends
ratified-superseding remediations to decision-needed report items (never
fixer/review-fix), and splits compound findings. Plan-reviewer verifies
Intent presence and names ratified ground its findings would touch.
Task-manager's constraint sweep carries ratified-ground constraints into
owning-task ACs as stop-and-escalate ground. Test-first against the four
existing content test files. Per plan Risks: extend, never displace —
existing content tests stay green unmodified.

<!-- AC:BEGIN -->
- [x] #1 B-009 worker prompt routes deviations through the classifier with drafted escalations, with its named test and marker green
- [x] #2 B-010 quality-manager prompt classifies remediations against ratified ground before routing, with its named test and marker green
- [x] #3 B-011 plan-reviewer prompt verifies intent presence and names ratified ground in findings, with its named test and marker green
- [x] #4 B-012 task-manager prompt carries ratified-ground constraints into task ACs, with its named test and marker green
- [x] #5 Existing worker, quality-manager, plan-reviewer, and task-manager content tests stay green unmodified
<!-- AC:END -->

## Implementation Notes

Test-first, 4 RED then GREEN. Worker: classify-before-you-code Critical Rule + scoped the reasonable-decision rule to classifier-delegated ground. QM: ratified-ground classification block in step 5 with decision-needed routing coherent with existing ledger semantics (P0/P1 -> failure-summary exit; P2/P3 -> deferred with note). Plan-reviewer: two Critical Rules + reference list line. Task-manager: mutability carried in the step-6 constraint sweep. Existing tests untouched, 17/17 green.
