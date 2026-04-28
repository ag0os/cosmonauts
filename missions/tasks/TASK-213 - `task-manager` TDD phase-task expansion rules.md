---
id: TASK-213
title: '`task-manager` TDD phase-task expansion rules'
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:tdd-orchestration-hardening'
dependencies:
  - TASK-212
createdAt: '2026-04-28T14:29:58.897Z'
updatedAt: '2026-04-28T14:53:47.862Z'
---

## Description

Update `bundled/coding/coding/prompts/task-manager.md` so that TDD plans (identified by a `## Behaviors` section) expand each behavior into exactly four dependency-linked phase tasks. Non-TDD plans must NOT trigger this expansion — the negative case is mandatory. Add focused prompt test coverage for both cases.

**Files to change:**
- `bundled/coding/coding/prompts/task-manager.md` — add TDD-plan detection and four-task-per-behavior emission rules
- `tests/prompts/task-manager.test.ts` — new file covering TDD positive case and non-TDD negative case

**Four-task emission contract per behavior (from plan):**
- `<base>-red`: label `phase:red`, no dependencies → capture returned ID as `id_red`
- `<base>-red-verify`: label `phase:red-verify`, `dependencies: [id_red]` → capture as `id_red_verify`
- `<base>-green`: label `phase:green`, `dependencies: [id_red_verify]` → capture as `id_green`
- `<base>-refactor`: label `phase:refactor`, `dependencies: [id_green]`
- No parent behavior task is created
- Dependencies are wired via captured `task_create` IDs, NOT by title (forward-references are forbidden)

**Content split contract:**
- `-red`: behavior statement + `## Test Targets` to author
- `-red-verify`: one failure claim per test target (shape per verifier contract)
- `-green`: `## Test Targets` + `## Implementation Pointers`; targets must now pass
- `-refactor`: green target list (must remain passing); includes both `## Test Targets` and `## Implementation Pointers`

**File-set contract:** `-red` and `-red-verify` must include `## Test Targets`; `-green` and `-refactor` must include both `## Test Targets` and `## Implementation Pointers`.

<!-- AC:BEGIN -->
- [x] #1 task-manager.md detects a TDD plan by the presence of a ## Behaviors section; plans without this section follow existing single-task-per-scope-item rules with no four-task expansion
- [x] #2 For each TDD behavior, task-manager.md instructs creating four tasks in order: <base>-red (phase:red, no deps), <base>-red-verify (phase:red-verify, depends on id_red), <base>-green (phase:green, depends on id_red_verify), <base>-refactor (phase:refactor, depends on id_green)
- [x] #3 Each generated task ID is captured from the task_create result before the next task is created; dependencies are wired via captured IDs, never via title forward-references
- [x] #4 No parent behavior task is created; the four phase tasks replace it entirely
- [x] #5 Content split is correct: -red carries behavior statement + ## Test Targets to author; -red-verify carries one failure claim per test target; -green carries ## Test Targets + ## Implementation Pointers (targets must now pass); -refactor carries the green target list (must remain passing)
- [x] #6 Phase tasks include the required ## Test Targets and ## Implementation Pointers sections per the file-set contract (-red and -red-verify get Test Targets; -green and -refactor get both)
- [x] #7 tests/prompts/task-manager.test.ts covers the TDD positive case (four-task emission, correct labels, correct dependency chain) AND the non-TDD negative case (no four-task expansion for a plan without ## Behaviors)
<!-- AC:END -->

<!-- AC:BEGIN -->
- [ ] #1 task-manager.md detects a TDD plan by the presence of a ## Behaviors section; plans without this section follow existing single-task-per-scope-item rules with no four-task expansion
- [ ] #2 For each TDD behavior, task-manager.md instructs creating four tasks in order: <base>-red (phase:red, no deps), <base>-red-verify (phase:red-verify, depends on id_red), <base>-green (phase:green, depends on id_red_verify), <base>-refactor (phase:refactor, depends on id_green)
- [ ] #3 Each generated task ID is captured from the task_create result before the next task is created; dependencies are wired via captured IDs, never via title forward-references
- [ ] #4 No parent behavior task is created; the four phase tasks replace it entirely
- [ ] #5 Content split is correct: -red carries behavior statement + ## Test Targets to author; -red-verify carries one failure claim per test target; -green carries ## Test Targets + ## Implementation Pointers (targets must now pass); -refactor carries the green target list (must remain passing)
- [ ] #6 Phase tasks include the required ## Test Targets and ## Implementation Pointers sections per the file-set contract (-red and -red-verify get Test Targets; -green and -refactor get both)
- [ ] #7 tests/prompts/task-manager.test.ts covers the TDD positive case (four-task emission, correct labels, correct dependency chain) AND the non-TDD negative case (no four-task expansion for a plan without ## Behaviors)
<!-- AC:END -->

## Implementation Notes

Updated the shared task-manager prompt to branch on `## Behaviors`, emit exactly four dependency-linked phase tasks per behavior, and preserve the non-TDD single-task-per-scope-item path. Added prompt regression coverage for the TDD and non-TDD cases. Verified with `bun run test`, `bun run lint`, and `bun run typecheck`. Commit: `da7a084`. 
