# Stage 8 review 1 — Claude subagent

Prompt: `stage8-review-1-prompt.md`. Reviewed `b1cd770..6f57849` (TASK-727 `8b59412`, plus coordinator commit `2b44ee9`). Condensed by the coordinator.

**Verdict: DO-NOT-SHIP-YET.** Two prose repairs away from SHIP. The archive, the link repair and the chain tests are correct. Two live caller surfaces still claim that the QM fixes things.

## Findings

- **MEDIUM-1: `domains/shared/capabilities/spawning.md:16` and `:22` still describe the old QM.**
  - What it says: "Merge-readiness gates → `quality-manager`", "Remediation from findings → `fixer`" and "what the quality-manager changed".
  - Why it matters: this capability is part of the system prompt for `cosmo`, `cody`, `coordinator`, `planner` and `quality-manager`, so it is a lead-prompt layer. It also contradicts the rewritten `/skill:spawning`.
  - Scenario: cody treats `quality-manager: ok` as merge-readiness and looks in `git log` for fixes the QM made.
  - Breaks: B-012, AC-016 and TASK-727 AC #3.
- **MEDIUM/LOW-2: `docs/fallow-workflow-integration.md:235` and `:299-311` describe the old QM protocol.**
  - What it says: the QM routes findings, re-verifies, constrains the Fixer, re-runs Fallow after every remediation, and writes `qm.md`.
  - Why it matters: `docs/fallow.md:21` links to this page as live guidance.
  - Breaks: B-012 and D-022, which puts docs in scope.
- **LOW-3: `external-commands/implement-plan.md:50` says the host uses the merge-base of captured HEAD and local `BASE`.**
  - Actual behavior: `findReviewBase` (`quality-review-workspace.ts:325-337`) tries `main`, then `master`, then `origin/main`.
  - Scenario: in a repository based on `develop` that still has a stale `main`, the doc misstates the reviewed range.
- **LOW-4: `ROADMAP.md:271` still says the QM panel "writes generic `review-round-N.md` names that overwrite other plans' rounds".** This is stale guidance on a live surface.

## Evidence

- **Exact `git grep -n -F` for all eleven old paths:** every remaining hit is historical or the README map, and none was changed in this diff. The historical hits are:
  - archived plans and tasks;
  - `knowledge/analysis-investigation-procedures.md:143`;
  - the frozen fixture `tests/fixtures/knowledge-seed-inventory.json:39`;
  - the evidence report `missions/reviews/codex-post-review-code-structure-map.md`.
- **Live links:** the only live hit, `missions/plans/framework-health/plan.md:414` (an active plan), is repaired.
- **Archive:**
  - All eleven moves are R100 renames.
  - `git log --follow` reaches pre-move history on four files that were sampled.
  - The README maps all eleven.
  - Both `analysis-gate-coverage` files stay in place.
- **Historical surfaces:** untouched. D-001 and the spec citations are verbatim (D-015).
- **Chains:**
  - All five named chains end at a single terminal `quality-manager` and describe a findings report.
  - Appending `-> fixer` to `implement` fails 3 tests, so the tests can fail.
- **Caller guidance:** consistent across the rest of the file seam. It routes remediation through tasks, Drive and re-review. It keeps checks, gate resolution, triage and specialists. It describes the D-019 not-configured outcome.
- **Out-of-seam wording edits:** `fixer.md` and `planner.md` only align their wording.
- **D-014:** the tests are structural and outcome-based. None match sentences.
- **Regressions:** no runtime code changed.
  - `tsc` and Biome are clean, and the Fallow audit is clean.
  - Suite: 3405/3406. The one failure is the `validate-harness-exports` timeout flake, which passes 12/12 in isolation.

## Residuals

- **End-to-end coverage (AC #3/#6 partly met):** the test drives `runChain` with the shipped chain definitions and a stubbed `qualityReview.execute`, not the CLI or `runStart`. `verify` runs inline in that test but is durable in production, and only the routing test pins that. Earlier stages' durable QM tests cover the rest.
- **Sandbox change:** `implement-plan.md` Phase 3 changed codex from bypass-sandbox to `--sandbox read-only` for plans that are not QM plans. That fits review-only, but codex may no longer be able to run gates.
