---
id: TASK-210
title: >-
  Plan frontmatter infrastructure for `behaviorsReviewPending` + tdd-planner
  revision mode
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies: []
createdAt: '2026-04-28T14:29:18.527Z'
updatedAt: '2026-04-28T14:39:37.646Z'
---

## Description

Extend shared plan infrastructure to round-trip an optional `behaviorsReviewPending` boolean field through plan frontmatter without losing it on unrelated updates. Update `tdd-planner.md` to gate revision mode on this flag and require atomic flag-clear alongside the revised `## Behaviors` body in a single `plan_edit` call.

**Files to change:**
- `lib/plans/plan-types.ts` — add `behaviorsReviewPending?: boolean` to Plan interface and update input type
- `lib/plans/file-system.ts` — read/write the flag in YAML frontmatter without dropping it on save
- `lib/plans/plan-manager.ts` — thread the flag through create/get/update operations
- `domains/shared/extensions/plans/index.ts` — expose via `plan_view` details; allow `plan_edit` to set/clear it
- `bundled/coding/coding/prompts/tdd-planner.md` — define first-pass vs revision-pass mode; gate revision on flag; require single-call atomicity on consume side; hard-fail when flag is true but `behavior-review.md` is absent/empty
- `tests/plans/plan-manager.test.ts` — round-trip persistence coverage
- `tests/extensions/plans.test.ts` — `plan_view`/`plan_edit` flag coverage

**Key constraints from plan:**
- Absent or `false` → no pending review; `true` → revision pass required
- `behavior-review.md` existence alone is NEVER a mode signal
- If flag is `true` but `behavior-review.md` is absent/empty/unparseable, `tdd-planner` MUST hard-fail (not silently clear)
- Consume-side write (revised `## Behaviors` body + `behaviorsReviewPending: false`) must be a SINGLE `plan_edit` call

Acceptance Criteria:
  [x] #1 lib/plans/plan-types.ts declares `behaviorsReviewPending?: boolean` on both the Plan interface and the update input type
  [x] #2 lib/plans/file-system.ts reads and writes `behaviorsReviewPending` in plan YAML frontmatter; updating unrelated fields (title, status, body) does not drop the flag
  [x] #3 lib/plans/plan-manager.ts threads the flag through create, get, and update operations without loss
  [x] #4 domains/shared/extensions/plans/index.ts exposes the flag in `plan_view` output and allows `plan_edit` to set it to true, false, or leave it unchanged when not provided
  [x] #5 tdd-planner.md selects revision mode only when `behaviorsReviewPending === true`; a stale behavior-review.md without the flag does NOT trigger revision mode
  [x] #6 tdd-planner.md hard-fails with a clear error (no silent clear) when behaviorsReviewPending is true but behavior-review.md is absent, empty, or yields zero parseable findings
  [x] #7 tdd-planner.md clears behaviorsReviewPending and writes the revised ## Behaviors content in a single plan_edit call, not two separate calls
  [x] #8 tests/plans/plan-manager.test.ts covers round-trip persistence: set to true reads back true; update unrelated field leaves flag intact; set to false reads back false
  [x] #9 tests/extensions/plans.test.ts covers plan_view showing the flag and plan_edit correctly setting/clearing it

<!-- AC:BEGIN -->
- [ ] #1 lib/plans/plan-types.ts declares `behaviorsReviewPending?: boolean` on both the Plan interface and the update input type
- [ ] #2 lib/plans/file-system.ts reads and writes `behaviorsReviewPending` in plan YAML frontmatter; updating unrelated fields (title, status, body) does not drop the flag
- [ ] #3 lib/plans/plan-manager.ts threads the flag through create, get, and update operations without loss
- [ ] #4 domains/shared/extensions/plans/index.ts exposes the flag in `plan_view` output and allows `plan_edit` to set it to true, false, or leave it unchanged when not provided
- [ ] #5 tdd-planner.md selects revision mode only when `behaviorsReviewPending === true`; a stale behavior-review.md without the flag does NOT trigger revision mode
- [ ] #6 tdd-planner.md hard-fails with a clear error (no silent clear) when behaviorsReviewPending is true but behavior-review.md is absent, empty, or yields zero parseable findings
- [ ] #7 tdd-planner.md clears behaviorsReviewPending and writes the revised ## Behaviors content in a single plan_edit call, not two separate calls
- [ ] #8 tests/plans/plan-manager.test.ts covers round-trip persistence: set to true reads back true; update unrelated field leaves flag intact; set to false reads back false
- [ ] #9 tests/extensions/plans.test.ts covers plan_view showing the flag and plan_edit correctly setting/clearing it
<!-- AC:END -->

## Implementation Notes

Already implemented on HEAD in commit `3168124` (`TASK-210: Persist behavior review plan state`). Verified with `bun run test tests/plans/plan-manager.test.ts tests/extensions/plans.test.ts`, `bun run test`, `bun run typecheck`, and `bun run lint`.
