---
id: TASK-192
title: 'Add prompt-contract tests for cosmo, spec-writer, and planner'
status: Done
priority: medium
assignee: worker
labels:
  - testing
  - 'plan:spec-plan-quality-gates-a'
dependencies:
  - TASK-190
  - TASK-191
createdAt: '2026-04-17T15:28:57.336Z'
updatedAt: '2026-04-17T15:39:34.485Z'
---

## Description

Create three new prompt-contract test files under `tests/prompts/` using the existing `readFile + toContain` pattern established in `tests/prompts/integration-verifier.test.ts:1-24` and `tests/prompts/quality-manager.test.ts:1-51`.

Assert durable contract strings — phrases and section labels — not full prompt copy. Each test protects the gate behavior and the non-persisted-output boundary against future prompt refactors.

**`tests/prompts/cosmo.test.ts`** — assert:
- Three-route decision identifiers (spec-writer, cosmo-facilitates-dialogue, planner-autonomous) are present
- Signal language for each route (fuzzy/no-spec → spec-writer; interactive-dialogue → cosmo-facilitates-dialogue; "just decide"/non-interactive → planner-autonomous)
- Route-announcement template fields (Route, Why, Next)
- Direct-planner suggestion wording preserved when routing to cosmo-facilitates-dialogue
- Planner-bypass option wording preserved when routing to spec-writer

**`tests/prompts/spec-writer.test.ts`** — assert:
- Phase-transition announcement phrases (Frame → Shape, Shape → Detail, Detail → Write)
- All four readiness rubric headings (Specificity, Constraints, Context, Success criteria)
- Visible-unchecked behavior instruction
- Waiver language ("proceed with assumptions")
- Critical-assumption category definitions (user-visible behavior, scope boundaries, existing-feature interaction, acceptance criteria)
- Threshold escalation wording (critical >= 3)
- Autonomous fallback wording (convert to Assumptions/Open Questions)

**`tests/prompts/planner.test.ts`** — assert:
- Tailored plan-readiness rubric headings present (Specificity, Constraints, Context, Success criteria)
- Reference to existing step-5 QC rule (not a new hard-coded copy)
- Autonomous fallback language (convert blockers to assumptions before plan_create)

**Pattern reference:** `tests/prompts/integration-verifier.test.ts` and `tests/prompts/quality-manager.test.ts` — use `new URL(...)` for the prompt path, `readFile` with utf-8, and `expect(content).toContain(...)` assertions grouped into `describe`/`it` blocks.

<!-- AC:BEGIN -->
- [ ] #1 tests/prompts/cosmo.test.ts exists and asserts the three route names, signal phrases, route-announcement template fields, direct-planner suggestion wording, and planner-bypass wording
- [ ] #2 tests/prompts/spec-writer.test.ts exists and asserts all three phase-transition phrases, all four readiness rubric headings, visible-unchecked behavior, waiver language, critical-assumption categories, threshold escalation wording, and autonomous fallback
- [ ] #3 tests/prompts/planner.test.ts exists and asserts all four tailored plan-readiness headings, a reference to the existing step-5 QC rule rather than hard-coded counts, and autonomous fallback language
- [ ] #4 All three test files follow the readFile + toContain pattern consistent with tests/prompts/integration-verifier.test.ts and tests/prompts/quality-manager.test.ts
- [ ] #5 bun run test -- tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts passes with no failures
<!-- AC:END -->

## Implementation Notes

Completed AC #1-#5. Added tests/prompts/cosmo.test.ts and tests/prompts/spec-writer.test.ts; verified existing tests/prompts/planner.test.ts already covered the required planner contract assertions. Verified with `bun run test -- tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts` (pass), `bunx biome check tests/prompts/cosmo.test.ts tests/prompts/spec-writer.test.ts tests/prompts/planner.test.ts` (pass), and `bun run typecheck` (pass). `bun run lint` still fails on unrelated pre-existing formatting issues in `.cosmonauts/config.json` and `missions/tasks/config.json`.
