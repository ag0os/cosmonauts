---
slug: dialogic-planner
title: Dialogic planner + TDD chain fixes + reviewer panel
status: in-progress
---

# Dialogic Planner

Prompt-engineering-only changes. Three phases. Memory read-path deferred to future RAG work.

## Phase 1 — Dialogic planner

Make the planner mode-aware: dialogic when interactive, autonomous when a chain stage. Separation of concerns kept — spec-writer still owns product/WHAT, planner still owns engineering/HOW.

- Create `bundled/coding/coding/skills/design-dialogue/SKILL.md` — on-demand skill teaching dialogic cadence (2–3 alternatives per major decision, Decision Log, incremental approval).
- Update `bundled/coding/coding/prompts/planner.md` — add "Interactive vs. Autonomous Mode" subsection, reference the skill, add `Decision Log` section to the Plan Output Format.
- Update `bundled/coding/coding/prompts/tdd-planner.md` — mirror the dialogic mode section, add Decision Log.
- Update `bundled/coding/coding/agents/planner.ts` + `tdd-planner.ts` — add `"design-dialogue"` to skills.
- Update `bundled/coding/coding/prompts/spec-writer.md` — add ideation stance ("when the idea is still fuzzy, diverge before converge").
- Update `bundled/coding/coding/prompts/cosmo.md` — add routing: product-framing → spec-writer; engineering design → planner (dialogic if interactive).

## Phase 2 — Chain fixes

- Reorder `plan-and-tdd` in `bundled/coding/coding/workflows.ts` to `planner → tdd-planner → task-manager → tdd-coordinator → integration-verifier → quality-manager`. Structure → behaviors → tasks is the natural order.
- Add `reviewed-tdd` and `reviewed-spec-and-tdd` workflows that insert `plan-reviewer` after the final planning stage. TDD chains currently skip adversarial review.

## Phase 4 — Reviewer panel

- Add three specialized reviewers alongside existing `plan-reviewer`: `security-reviewer`, `performance-reviewer`, `ux-reviewer`. Same format, focused lens.
- Add `panel-reviewed-plan-and-build` workflow using parallel bracket group.
- Update `tests/domains/coding-agents.test.ts` to include the new agent definitions in invariants.
- Update `tests/domains/coding-workflows.test.ts` to cover new workflows in the integration-verifier invariant check.

## Execution order

1. Skill file (main session).
2. Parallel: planner updates, tdd-planner updates, spec-writer+cosmo updates, reviewer panel.
3. Serial: workflow changes + test updates.
4. Verify: `bun run test`, `bun run lint`, `bun run typecheck`.
5. Commit on `dialogic-planner` branch.

## Deferred

- Memory read-path in planners (Phase 3) — waits for RAG infra; reading growing JSONL would bloat context.
- `feasibility-scout`, `rollout-planner`, `demonstrator`, `product-strategist` — heavier additive agents, revisit after Phase 1 validates the dialogue model.
