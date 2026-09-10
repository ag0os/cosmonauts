---
id: TASK-673
title: Dominate inline task decomposition with earlier addressed evidence
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-672
createdAt: '2026-09-10T02:14:31.591Z'
updatedAt: '2026-09-10T02:14:31.591Z'
---

## Description

Implementation Order step 6. Owns behavior B-008 exclusively. Implement the inline pre-spawn task-manager guard in `lib/orchestration/chain-runner.ts` and its result/event contracts in `lib/orchestration/types.ts`, using the topology purpose and run-local evidence established by TASK-668 through TASK-672. Prove sequential and parallel shapes in `tests/orchestration/chain-runner.test.ts`.

Recorded ground: D-004 and D-010 are derived and may change only through amend-on-record. The spec acceptance criterion requiring a visible machine-readable unaddressed signal and the unchanged-chain criterion are ratified: warning-only continuation, same-index scheduler-order authorization, or changing shipped non-review/single-stage behavior requires stop-and-escalate.

<!-- AC:BEGIN -->
- [ ] #1 B-008 is proven by `tests/orchestration/chain-runner.test.ts` > `blocks sequential and parallel task decomposition until earlier plan review is addressed`, carrying `@cosmo-behavior plan:chain-stage-context#B-008`, for no-reviser sequential chains, intervening nonreviser chains, reviser/task-manager sibling groups, and reviewer/task-manager same groups.
- [ ] #2 Every task-manager at or after a participating plan-reviewer is guarded before agent spawn and may run only with matching addressed evidence whose source topology index is strictly lower than the task-manager's zero-based top-level index.
- [ ] #3 Missing, unaddressed, mismatched, unreadable, unsafe, or equal/later-index evidence makes zero task-manager spawn calls, emits `unaddressed_review_round`, and yields unsuccessful stage/group/chain results with nonempty typed errors.
- [ ] #4 Same-index evidence never authorizes task decomposition in either sibling scheduling order; safe parallel siblings may finish, but the group and chain still fail.
- [ ] #5 A plan-reviewer participates for the guard when a task-manager is at the same or a later top-level index even without a repeated reviser; generic reviewers do not activate the plan-review guard.
- [ ] #6 Task-managers with no plan-reviewer at or before their topology index remain unchanged, preserving shipped `implement`, `adapt`, and every single-stage chain; no attended/unattended policy switch is introduced.
- [ ] #7 Task-manager recognition is pinned to the same identity discipline TASK-668 uses for reviewers: compare the **unqualified** role of `stage.agentReference?.resolved.qualifiedId ?? stage.name`, never a bare `stage.name === "task-manager"` equality. A guard keyed to the wrong identity form fires on nothing while every other AC still passes green, so this is asserted directly rather than left implicit.
- [ ] #8 AC #1's test contexts additionally cover a DSL-qualified `coding/task-manager` stage following a `coding/plan-reviewer`, and a project-bound task-manager whose stage carries an `agentReference`. Both are guarded identically to the bare `task-manager` form used by the shipped chains.
<!-- AC:END -->
