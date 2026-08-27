---
type: decision
title: Prompt-Only Spec/Plan Quality Gates (Plan A)
description: Archived plan distillation for spec-plan-quality-gates-a.
resource: knowledge/spec-plan-quality-gates-a.md
tags:
  - 'plan:spec-plan-quality-gates-a'
  - 'source:legacy-distillation'
timestamp: '2026-04-17T16:20:00.000Z'
scope: project
kind: semantic
writer: knowledge-surface-migration
source: memory/spec-plan-quality-gates-a.md
date: '2026-08-20T17:05:15.000Z'
legacySource: session
legacyPlan: spec-plan-quality-gates-a
legacyDistilledAt: '2026-04-17T16:20:00.000Z'
legacySourceSha256: 76fd817c61dc49c6a8fe0f4525991d07384848d2c9911c4288bbd3041748fb74
---

# Prompt-Only Spec/Plan Quality Gates (Plan A)

## What Was Built

Added prompt-only quality gates at the human→spec→plan boundary: a three-route planning router in `cosmo.md`, mandatory Frame→Shape→Detail phase cadence and a visible four-factor readiness check in `spec-writer.md`, and a tailored pre-`plan_create` readiness gate in `planner.md`. Three prompt-contract test files lock the routing, gate behavior, and non-persisted-output boundaries against future prompt refactors. No `lib/` changes, no new agents, no workflow rewiring — purely persona-prompt enforcement.

## Key Decisions

- **Three-path router, not binary (D-008):** Cosmo routes among `spec-writer` (fuzzy/no-spec), `cosmo-facilitates-dialogue` (interactive design back-and-forth), and `planner-autonomous` (just decide / non-interactive / post-dialogue). The binary spec-writer/planner design was rejected because `cosmo.md:37-40` already encodes the Cosmo-facilitated dialogue path — collapsing to two routes would silently drop a live behavior.
- **Interactive blocks; autonomous converts (D-007):** Unchecked required readiness items block `plan_create` in interactive mode (until resolved or explicitly waived). In autonomous/non-interactive mode the same items become explicit `Assumptions`/`Open Questions` and execution continues. Hard-blocking autonomous runs would deadlock existing chains; always proceeding would make the rubric toothless.
- **Fixed critical-assumption threshold of 3 with waiver path (D-010):** `spec-writer.md` requires one more clarification round when `critical >= 3` in interactive mode, unless the human explicitly waives with `proceed with assumptions`. Fixed over configurable because Plan A excludes framework work; the waiver prevents trapping users who knowingly accept assumptions. Critical = changes user-visible behavior, scope boundaries, existing-feature interaction, or acceptance criteria.
- **Shared rubric shell, tailored items (D-006):** Both `spec-writer` and `planner` readiness checks use the same four headings (Specificity, Constraints, Context, Success criteria) but with role-specific checklist items. Shared headings make the gate recognizable; tailored items prevent generic language that blocks nothing.
- **Reference existing QC rules, don't copy them (PR-002):** The planner readiness gate's Success criteria item points to "the rule already defined in step 5" rather than restating 3–8 items / ≥⅓ failure cases. A third independent copy inside the same file creates silent drift risk.

## Patterns Established

- **Prompt-contract test pattern:** `readFile` + `toContain` in `tests/prompts/*.test.ts`. Assert durable contract phrases and section labels — routing signals, phase-transition announcements, waiver language, threshold wording — not full prompt copy. See `tests/prompts/integration-verifier.test.ts` as the canonical example.
- **Phase cadence in persona prompt, not in a skill:** If a skill explicitly excludes a behavior (e.g., `design-dialogue/SKILL.md:98-100` excludes requirements capture), encode that behavior in the agent's persona prompt, not in the skill. `spec-writer.md` owns the Frame→Shape→Detail cadence; the skill is conceptual precedent only.
- **Readiness blocks are pre-tool-call conversational output, never persisted sections.** A reviewer-verified QC criterion (not auto-tested) must inspect that the persisted output format sections are unchanged.

- **Fuzzy ideas diverge before converging (from dialogic-planner).** When the product idea is not yet well formed, broaden the option space before hardening the first interpretation: present materially different directions, compare their user-visible consequences, and only then converge on the behavior to specify. Once product intent settles, engineering choices hand to the planning role.
- **Interactive planning surfaces alternatives and seeks incremental approval (from dialogic-planner).** In an interactive session the planner offers two or three meaningful alternatives per major engineering decision, records the selection, and seeks approval before moving on; in an automated stage it decides and documents autonomously so the chain never blocks on unavailable input. One plan format serves both modes — the decision log preserves the reasoning either way.

## Files Changed

- `bundled/coding/coding/prompts/cosmo.md` — three-route decision tree replacing four-bullet routing heuristic; route-announcement template; planner-bypass and direct-planner suggestion preserved
- `bundled/coding/coding/prompts/spec-writer.md` — mandatory Frame→Shape→Detail cadence; four-factor Readiness Check block with visible-unchecked behavior; interactive blocking + waiver; autonomous fallback; critical-assumption classification; fixed threshold
- `bundled/coding/coding/prompts/planner.md` — tailored Plan Readiness Check (conversational-only, before `plan_create`); references step-5 QC rule instead of duplicating it
- `tests/prompts/cosmo.test.ts` — new; locks three-route contract, signals, announcement template, bypass wording
- `tests/prompts/spec-writer.test.ts` — new; locks phase transitions, rubric headings, waiver language, critical-assumption categories, threshold escalation, autonomous fallback
- `tests/prompts/planner.test.ts` — added during TASK-191, verified/extended in TASK-192; locks tailored readiness headings, step-5 reference, autonomous fallback

## Gotchas & Lessons

- **Always read the actual prompt before planning changes to it (PR-001).** The plan-reviewer caught that the initial plan proposed a binary router, misreading `cosmo.md`'s existing three-behavior contract. A worker implementing literally would have silently dropped the Cosmo-facilitated dialogue path. The plan-reviewer's clean-context read of `cosmo.md:37-40` surfaced the mismatch before any code changed.
- **Readiness blocks must not become persisted sections (PR-004).** Nothing in QC-001–QC-006 auto-verified this boundary; it required an explicit reviewer-verified criterion (QC-007). A worker could satisfy every verifier test while also adding a `Readiness Check` section to the spec output format, breaking downstream agents that read `spec.md` as authoritative. Always add a reviewer-verified criterion for persistence boundaries.
- **Expanding `cosmo.subagents` breaks the coding-agents invariant test if it uses a hardcoded fixture.** The quality-manager round-1 fix was to have `tests/domains/coding-agents.test.ts` load definitions from the real domain loader (`loadDomainsFromSources`) rather than a static list. Apply this fix whenever the subagents allowlist changes.
- **The system dogfooded its own plan-and-build + plan-reviewer loop** to ship changes to its own prompts. The plan-reviewer found the binary-router error (PR-001) before any implementation task ran — demonstrating the adversarial review step is worth the cost even on prompt-only plans.
