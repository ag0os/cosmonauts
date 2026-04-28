---
id: TASK-215
title: '`quality-manager` TDD remediation routing'
status: Done
priority: medium
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies:
  - TASK-214
createdAt: '2026-04-28T14:30:35.571Z'
updatedAt: '2026-04-28T15:14:37.937Z'
---

## Description

Update `quality-manager.md` so behavior-shaped findings route to four-phase-task sets dispatched via `tdd-coordinator`, structural/no-test-target findings route to a single `phase:green` task via `coordinator`, and planless/verifier-native cases keep the `fixer` fallback. Add `tdd-coordinator` to the quality-manager subagent allowlist.

**Files to change:**
- `bundled/coding/coding/agents/quality-manager.ts` — add `tdd-coordinator` to `subagents` while retaining `coordinator`
- `bundled/coding/coding/prompts/quality-manager.md` — apply behavior-shaped predicate, routing rules
- `tests/prompts/quality-manager.test.ts` — update/extend coverage

**Behavior-shaped predicate (must be cited verbatim in prompt):**
> A finding is **behavior-shaped** iff it identifies (a) a code path that can be exercised by the project's test runner AND (b) at least one specific input or scenario that produces an observable wrong outcome a failing test could capture (a wrong return value, a missing error, an incorrect side effect on a known surface). Otherwise the finding is **structural**.

**Routing rules:**
1. Behavior-shaped finding + active TDD plan (`activePlanSlug` exists, plan has `## Behaviors`):
   - Create four phase tasks with `review-fix` and `review-round:<n>` labels
   - `chain_run(expression: "tdd-coordinator", prompt: "Process only tasks labeled review-round:<n>...", completionLabel: "review-round:<n>")`
2. Structural finding (no meaningful test target):
   - Create one `phase:green` task with `review-fix`, `review-round:<n>`, and `plan:<slug>` labels
   - Route via `coordinator`
3. Planless run or verifier/project-native failure: route via `fixer`

**Routing predicate applies to finding prose** (`summary`, `suggestedFix`, task ACs) — not to structured fields (finding producers do not emit structured code-path/scenario data yet; this remains prompt-level judgment).

<!-- AC:BEGIN -->
- [ ] #1 bundled/coding/coding/agents/quality-manager.ts adds tdd-coordinator to subagents while retaining coordinator
- [ ] #2 quality-manager.md cites the behavior-shaped predicate verbatim: behavior-shaped iff (a) exercisable code path AND (b) specific input/scenario producing observable wrong outcome; otherwise structural
- [ ] #3 quality-manager.md applies the predicate to finding prose (summary, suggestedFix, task ACs), not to structured behavior fields
- [ ] #4 Behavior-shaped findings in TDD mode create four phase tasks with review-fix and review-round:<n> labels and dispatch via chain_run with expression tdd-coordinator
- [ ] #5 Structural findings (no meaningful test target) create one phase:green task with review-fix, review-round:<n>, and plan:<slug> labels and dispatch via coordinator
- [ ] #6 Planless runs and verifier/project-native failures dispatch via fixer (existing behavior preserved)
- [ ] #7 tests/prompts/quality-manager.test.ts covers: behavior-shaped TDD finding routes through tdd-coordinator; structural no-test-target finding routes through coordinator; planless run uses fixer fallback
<!-- AC:END -->

## Implementation Notes

All ACs complete. `quality-manager.md` now explicitly keeps planless/verifier-native fixes on `fixer`, states that planned remediation tasks carry the `plan:<slug>` label via `plan: activePlanSlug`, and preserves behavior-shaped vs structural routing. `tests/prompts/quality-manager.test.ts` now covers the `tdd-coordinator`/`coordinator` routing split, the planless `fixer` fallback, and asserts the quality-manager allowlist contains both `coordinator` and `tdd-coordinator`. Verified with `bun run typecheck`, `bun run test`, and `bun run lint`. Commit: `4d916ea`.
