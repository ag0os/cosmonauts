---
id: TASK-212
title: '`behavior-reviewer` agent, workflow chain updates, and parity test'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies:
  - TASK-210
createdAt: '2026-04-28T14:29:41.701Z'
updatedAt: '2026-04-28T14:48:15.065Z'
---

## Description

Create the `behavior-reviewer` agent (definition + prompt), register its default stage prompt in `chain-runner.ts`, insert it plus the second `tdd-planner` pass into both `bundled/coding/coding/workflows.ts` and `lib/config/defaults.ts`, and add workflow-order/parity test coverage.

**Files to change:**
- `bundled/coding/coding/agents/behavior-reviewer.ts` — new agent definition (adversarial reviewer of `## Behaviors` section)
- `bundled/coding/coding/prompts/behavior-reviewer.md` — new prompt: review scope, report format (`behavior-review.md`), frontmatter flag writeback order (file write FIRST, then `plan_edit` with `behaviorsReviewPending: true`)
- `lib/orchestration/chain-runner.ts` — add `behavior-reviewer` to `DEFAULT_STAGE_PROMPTS`
- `bundled/coding/coding/workflows.ts` — insert `behavior-reviewer` + second `tdd-planner` pass into `tdd` and `spec-and-tdd` chains
- `lib/config/defaults.ts` — same chain updates, kept in parity with `workflows.ts`
- `tests/orchestration/workflows-parity.test.ts` — new test asserting both workflow sources define identical TDD chain sequences
- `tests/domains/coding-workflows.test.ts` — update to assert the `tdd-planner → behavior-reviewer → tdd-planner → task-manager` sub-sequence in TDD workflows
- `tests/orchestration/chain-runner.test.ts` — cover new `behavior-reviewer` default stage prompt

**Updated chain sequence (both sources):**
```
tdd: planner → plan-reviewer → planner → tdd-planner → behavior-reviewer → tdd-planner → task-manager → tdd-coordinator → integration-verifier → quality-manager
spec-and-tdd: spec-writer → planner → plan-reviewer → planner → tdd-planner → behavior-reviewer → tdd-planner → task-manager → tdd-coordinator → integration-verifier → quality-manager
```

**Atomicity rule for behavior-reviewer:** writes `behavior-review.md` FIRST, then sets `behaviorsReviewPending: true` via `plan_edit` — so a crash between leaves "file written, flag never set" which the first-pass logic handles cleanly.

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/coding/agents/behavior-reviewer.ts and bundled/coding/coding/prompts/behavior-reviewer.md exist, defining an adversarial reviewer that writes behavior-review.md first, then sets behaviorsReviewPending: true via plan_edit
- [ ] #2 lib/orchestration/chain-runner.ts includes behavior-reviewer in DEFAULT_STAGE_PROMPTS
- [ ] #3 Both bundled/coding/coding/workflows.ts and lib/config/defaults.ts contain the sub-sequence tdd-planner → behavior-reviewer → tdd-planner → task-manager in the tdd and spec-and-tdd chains
- [ ] #4 tests/orchestration/workflows-parity.test.ts (new file) asserts that both workflow sources define identical tdd and spec-and-tdd chain sequences
- [ ] #5 tests/domains/coding-workflows.test.ts passes with the updated chain ordering and covers the tdd-planner → behavior-reviewer → tdd-planner → task-manager sub-sequence
- [ ] #6 tests/orchestration/chain-runner.test.ts covers the new behavior-reviewer default stage prompt entry
- [ ] #7 bun run typecheck exits 0 with the new agent definition in place
<!-- AC:END -->

## Implementation Notes

All acceptance criteria are satisfied by the current repo state. Verified AC1-AC6 by inspection in the target files, then ran: `bun run test tests/orchestration/workflows-parity.test.ts tests/domains/coding-workflows.test.ts tests/orchestration/chain-runner.test.ts` (82 tests passed), `bun run typecheck` (0), and `bun run lint` (clean). No code diff was required because the requested behavior-reviewer/workflow/parity changes were already present in HEAD.
