---
id: TASK-191
title: Update planner.md with pre-plan_create readiness gate
status: Done
priority: high
assignee: worker
labels:
  - backend
  - 'plan:spec-plan-quality-gates-a'
dependencies:
  - TASK-189
createdAt: '2026-04-17T15:28:37.974Z'
updatedAt: '2026-04-17T15:36:29.683Z'
---

## Description

Modify `bundled/coding/coding/prompts/planner.md` to insert a short `Plan Readiness Check` immediately before `plan_create` (insertion point: between `planner.md:125` and `planner.md:127`).

**Rubric shape:** Use the same four shared headings as spec-writer (Specificity, Constraints, Context, Success criteria) but with items tailored to architecture/planning concerns:
- Specificity: scope and non-goals are explicit; major ambiguities resolved or logged as assumptions
- Constraints: module boundaries, dependency direction, and integration seams are explicit
- Context: existing code paths/patterns verified with file:line references
- Success criteria: the QC section meets the rule already defined in step 5 (do not restate the 3–8/≥1/3 failure-mode counts as a new hard-coded copy)

**Blocking behavior (consistent with spec-writer gate):**
- Interactive mode: missing required items block `plan_create` until resolved or explicitly waived
- Autonomous/non-interactive mode: unmet blockers are converted into explicit assumptions before `plan_create` (per the planner's existing assumptions and Decision Log rules at `planner.md:150-159`)

**Critical constraint:** The `Plan Readiness Check` block is conversational output emitted before `plan_create` only. It must NOT be added as a new persisted section to the plan output format defined at `planner.md:218-248`.

**Reference plan section:** Design → Planner gate, Integration seams for `planner.md:103-131` and `planner.md:150-159,192-248`, and D-003/D-007.

<!-- AC:BEGIN -->
- [ ] #1 A tailored Plan Readiness Check appears immediately before plan_create with all four shared headings: Specificity, Constraints, Context, and Success criteria, each with items specific to architecture/planning concerns
- [ ] #2 The Success criteria item in the readiness block references the QC rule already defined in planner step 5 rather than introducing a new hard-coded copy of quality-criteria counts
- [ ] #3 Interactive mode blocks plan_create when required items are unmet until they are resolved or explicitly waived by the human
- [ ] #4 Autonomous/non-interactive runs convert unmet blockers into explicit assumptions before plan_create rather than deadlocking
- [ ] #5 Plan Readiness Check is conversational-only and does not appear as a new persisted section in the plan output format
<!-- AC:END -->

## Implementation Notes

Added a conversational-only Plan Readiness Check before `plan_create` in `bundled/coding/coding/prompts/planner.md`, using the shared four-heading rubric tailored to architecture planning, with interactive blocking and autonomous assumption-conversion behavior. Added `tests/prompts/planner.test.ts` to lock the readiness headings, step-5 QC reference, blocking/fallback behavior, and non-persisted output boundary. Verification: `bun run test tests/prompts/planner.test.ts`, `bun run typecheck`, and `bunx biome check bundled/coding/coding/prompts/planner.md tests/prompts/planner.test.ts` passed. Full `bun run lint` still reports pre-existing formatting issues in unrelated local files `.cosmonauts/config.json` and `missions/tasks/config.json`.
