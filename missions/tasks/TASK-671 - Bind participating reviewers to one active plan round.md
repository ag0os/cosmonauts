---
id: TASK-671
title: Bind participating reviewers to one active plan round
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-670
createdAt: '2026-09-10T02:13:40.729Z'
updatedAt: '2026-09-10T02:13:40.729Z'
---

## Description

Implementation Order step 4. Owns behavior B-006 exclusively. Add the shared terminal-report contract in `lib/orchestration/review-revision.ts`, then integrate reviewer validation and run-local target state through `lib/orchestration/chain-runner.ts` and `lib/orchestration/types.ts`, with executable proof in `tests/orchestration/chain-runner.test.ts` and supporting characterization in `tests/orchestration/run-start-chain-characterization.test.ts`.

Recorded ground: D-004, D-005, D-007, D-009, and D-010 are derived and may change only through amend-on-record. Ratified scope forbids prior-stage output transport and new public/persistent plan state; any need to change personas, `behaviorsReviewPending`, its tool surface, or generic durable contracts is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [ ] #1 B-006 is proven by `tests/orchestration/chain-runner.test.ts` > `binds plan review to the expected or reviewer-established active target`, carrying `@cosmo-behavior plan:chain-stage-context#B-006`, across missing, malformed, multiple, nonterminal, inactive, mismatched, unsafe, and valid reports.
- [ ] #2 A participating reviewer is accepted only when its full assistant text contains exactly one sole matching `COSMO_PLAN_REVIEW` report as the last nonblank line, with only the allowed structurally valid slug and positive-integer round fields.
- [ ] #3 An available `resolvePlanSlug(config)` identity must match the report; otherwise a valid report establishes one run-local target only after the plan is proven active and its claimed round is the safe latest round from TASK-670.
- [ ] #4 Invalid or missing reviewer target states produce a stable typed `unaddressed_review_round` block with a nonempty stage error, stop later stages, and cannot seed state usable by a reviser or task-manager.
- [ ] #5 A newly accepted participating reviewer replaces prior run-local review state and clears any addressed topology index; generic reviewers and nonparticipating plan-reviewers do not create plan-gate state.
- [ ] #6 Report parsing occurs on full assistant text before summary truncation, passes no reviewer prose/report to later stages, and leaves `Plan.behaviorsReviewPending`, serialization, `plan_edit`, and all other plan persistence unchanged.
<!-- AC:END -->
