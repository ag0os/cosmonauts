You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a READ-ONLY review. Do not modify any file, do not run git commands that change state, and do not run the Quality Manager or any cosmonauts chain or drive.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`.

Stages 1–6 are closed. Both review channels gave SHIP at `missions/plans/qm-chain-safety/mid-review-10-*.md`.

This is a FOCUSED Stage 7 re-review.

Stage 7 review 1 found that B-010 host enforcement could be bypassed by ordinary behavior, and that wiring tests were missing. See `missions/plans/qm-chain-safety/stage7-review-1-{codex,claude}.md`.

TASK-747 (`fde1063`, diff `bfff951..HEAD`, ignoring `missions/` except as documentation) remediates those findings. Read `missions/tasks/TASK-747*.md`.

First, state for every stage7-review-1 finding whether it is RESOLVED, PARTIAL or OPEN, with file:line evidence, and check that its test would fail on the pre-TASK-747 code.

Authoritative documents:
- `missions/plans/qm-chain-safety/spec.md`: INV-001..005 and the ACs are ratified, especially AC-013, AC-014 and AC-016. The threat model sits beside the Intent.
- `plan.md`: B-010, B-011, D-005, D-012 as superseded by D-026, D-019, D-024..D-030, and Design §6.

THREAT MODEL (D-027): the QM protects against accidental damage, not a hostile change. List hostile-only routes in one line as residuals, unranked. D-028 accepts that host-run checks execute reviewed code.

Assess:
1. **B-011 / AC-014 (reviewer-models section).**
   - A completed assessment includes one generalist whose HOST-OBSERVED model is from a different family than the default implementer, and records every reviewer's model.
   - A same-family, unresolvable or substituted model fails visibly.
   - Unconfigured diversity follows D-019: visible "not configured" and human items, never `ready`, never refused.
   - Family normalization uses the shipped alias table, extended by the base-owned `qualityReview.modelFamilies`.
   - The implementer family comes from the default worker's Pi-resolved provider.
   - The override applies only to the always-present generalist, and shipped definitions are unchanged.
   - Identity never comes from reviewer prose.
2. **B-010 / AC-013 (calibration).**
   - A performance finding is P1 only with measured or reproduced cost that the reviewer can cite. Under D-026, check durations are no longer available to the panel.
   - No finding is closed or dismissed on the evidence of the lens that raised it alone.
   - Check both the prompts (semantically) and any host enforcement.
3. **Regressions to Stages 1–6** from this diff. The guarantees to recheck:
   - D-025: host-verified gates, and no `ready` with any host human item.
   - D-026 ordering.
   - Base-owned runtime and config.
   - The changed-scope audit still passes.
4. **Tests that cannot fail, correctness, liveness and scope.**
   - Anything beyond B-010/B-011.
   - Anything that conflicts with execution-liveness AC-015/016/018.
   - Whether `anthropic/claude-sonnet-5` resolves in the pinned Pi 0.80.6 catalog, and is a different family from the default worker (`openai-codex/gpt-5.6-sol`).

Output:
- severity-ranked findings (HIGH/MEDIUM/LOW), each with file:line, an accidental failing scenario, and the AC/B/D it breaks;
- residuals;
- a SHIP / DO-NOT-SHIP-YET verdict for Stage 7.
