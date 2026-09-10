---
id: TASK-673
title: Dominate inline task decomposition with earlier addressed evidence
status: Done
priority: high
labels:
  - backend
  - testing
  - 'plan:chain-stage-context'
dependencies:
  - TASK-672
createdAt: '2026-09-10T02:14:31.591Z'
updatedAt: '2026-09-10T19:05:50.836Z'
---

## Description

Implementation Order step 6. Owns behavior B-008 exclusively. Implement the inline pre-spawn task-manager guard in `lib/orchestration/chain-runner.ts` and its result/event contracts in `lib/orchestration/types.ts`, using the topology purpose and run-local evidence established by TASK-668 through TASK-672. Prove sequential and parallel shapes in `tests/orchestration/chain-runner.test.ts`.

Recorded ground: D-004 and D-010 are derived and may change only through amend-on-record. The spec acceptance criterion requiring a visible machine-readable unaddressed signal and the unchanged-chain criterion are ratified: warning-only continuation, same-index scheduler-order authorization, or changing shipped non-review/single-stage behavior requires stop-and-escalate.

<!-- AC:BEGIN -->
- [x] #1 B-008 is proven by `tests/orchestration/chain-runner.test.ts` > `blocks sequential and parallel task decomposition until earlier plan review is addressed`, carrying `@cosmo-behavior plan:chain-stage-context#B-008`, for no-reviser sequential chains, intervening nonreviser chains, reviser/task-manager sibling groups, and reviewer/task-manager same groups.
- [x] #2 Every task-manager at or after a participating plan-reviewer is guarded before agent spawn and may run only with matching addressed evidence whose source topology index is strictly lower than the task-manager's zero-based top-level index.
- [x] #3 Missing, unaddressed, mismatched, unreadable, unsafe, or equal/later-index evidence makes zero task-manager spawn calls, emits `unaddressed_review_round`, and yields unsuccessful stage/group/chain results with nonempty typed errors.
- [x] #4 Same-index evidence never authorizes task decomposition in either sibling scheduling order; safe parallel siblings may finish, but the group and chain still fail.
- [x] #5 A plan-reviewer participates for the guard when a task-manager is at the same or a later top-level index even without a repeated reviser; generic reviewers do not activate the plan-review guard.
- [x] #6 Task-managers with no plan-reviewer at or before their topology index remain unchanged, preserving shipped `implement`, `adapt`, and every single-stage chain; no attended/unattended policy switch is introduced.
- [x] #7 Task-manager recognition is pinned to the same identity discipline TASK-668 uses for reviewers: compare the **unqualified** role of `stage.agentReference?.resolved.qualifiedId ?? stage.name`, never a bare `stage.name === "task-manager"` equality. A guard keyed to the wrong identity form fires on nothing while every other AC still passes green, so this is asserted directly rather than left implicit.
- [x] #8 AC #1's test contexts additionally cover a DSL-qualified `coding/task-manager` stage following a `coding/plan-reviewer`, and a project-bound task-manager whose stage carries an `agentReference`. Both are guarded identically to the bare `task-manager` form used by the shipped chains.
- [x] #9 D-013.2: the guard re-assesses rather than trusting its cache. Immediately before spawning, a guarded task-manager re-runs the TASK-670 assessment for the bound slug and requires the safe latest assessable round to still equal the addressed round. A valid higher assessable round written after revision finalization yields a typed `stale-addressed-evidence` block and zero spawns. A test writes a newer round between revision finalization and the guard and asserts the block; passing AC #2 alone with cached state does not satisfy this.
- [x] #10 The revision-time bound target reaches the guarded task-manager prompt through the D-013.1 composer, so a guarded task-manager that does spawn names the slug and round it was authorized against.
<!-- AC:END -->
