---
id: TASK-671
title: Bind participating reviewers to one active plan round
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-670
createdAt: '2026-09-10T02:13:40.729Z'
updatedAt: '2026-09-10T18:40:06.307Z'
---

## Description

Implementation Order step 4. Owns behavior B-006 exclusively. Add the shared terminal-report contract in `lib/orchestration/review-revision.ts`, then integrate reviewer validation and run-local target state through `lib/orchestration/chain-runner.ts` and `lib/orchestration/types.ts`, with executable proof in `tests/orchestration/chain-runner.test.ts` and supporting characterization in `tests/orchestration/run-start-chain-characterization.test.ts`.

Recorded ground: D-004, D-005, D-007, D-009, and D-010 are derived and may change only through amend-on-record. Ratified scope forbids prior-stage output transport and new public/persistent plan state; any need to change personas, `behaviorsReviewPending`, its tool surface, or generic durable contracts is stop-and-escalate ground.

<!-- AC:BEGIN -->
- [x] #1 B-006 is proven by `tests/orchestration/chain-runner.test.ts` > `binds plan review to the expected or reviewer-established active target`, carrying `@cosmo-behavior plan:chain-stage-context#B-006`, across missing, malformed, multiple, nonterminal, inactive, mismatched, unsafe, and valid reports.
- [x] #2 A participating reviewer is accepted only when its full assistant text contains exactly one sole matching `COSMO_PLAN_REVIEW` report as the last nonblank line, with only the allowed structurally valid slug and positive-integer round fields.
- [x] #3 A reviewer report is accepted only after the named plan is proven to exist and be `active` **and** its claimed round is the safe latest round from TASK-670. These two checks apply on **both** branches and are never conditional on the presence of an expected slug. When `resolvePlanSlug(config)` supplies an expected identity the report must additionally match it; when it does not, the validated report establishes the run-local target. A test exercises every report state from #1 twice — once with an expected slug present and once absent — so an inactive plan or unsafe round cannot bind through the expected-slug path.
- [x] #4 Invalid or missing reviewer target states produce a stable typed `unaddressed_review_round` block with a nonempty stage error, stop later stages, and cannot seed state usable by a reviser or task-manager.
- [x] #5 A newly accepted participating reviewer replaces prior run-local review state and clears any addressed topology index; generic reviewers and nonparticipating plan-reviewers do not create plan-gate state.
- [x] #6 Report parsing occurs on full assistant text before summary truncation, passes no reviewer prose/report to later stages, and leaves `Plan.behaviorsReviewPending`, serialization, `plan_edit`, and all other plan persistence unchanged.
- [x] #7 Adding the `unaddressed_review_round` variant to the `ChainEvent` union leaves the tree green: `cli/chain-event-logger.ts` declares `CHAIN_EVENT_FORMATTERS` as a mapped type over the closed union, so a new variant makes that object literal miss a required key and `tsc --noEmit` fails. This task therefore lands a minimal formatter entry for the variant in the same commit that adds it. TASK-675 replaces that entry with the full B-011 rendering; it does not introduce the key. Every intermediate commit from here through TASK-674 passes the project's type-check step.
- [x] #8 D-013.5: two participating reviewers at the same top-level topology index that report different targets produce a typed `ambiguous-review-target` block rather than resolving by completion or event order; identical reports from both are accepted. A test exercises both completion orders for the differing-target case and asserts the same block either way.
- [x] #9 The active-plan check in AC #3 is satisfied only through the strict frontmatter read delivered by TASK-670, not through `PlanManager.getPlan`. A reviewer report naming a plan whose frontmatter status is absent or unrecognized blocks as `plan-status-indeterminate` instead of binding a target that the shared reader would have called `active`.
<!-- AC:END -->
