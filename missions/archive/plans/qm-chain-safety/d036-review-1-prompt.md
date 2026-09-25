You are an independent correctness and liveness reviewer for the Cosmonauts plan `qm-chain-safety`. This is a FOCUSED review of one change: TASK-766, which implements plan decision D-036, a human ruling of 2026-09-24. It runs under D-002 and D-034, which require two channels: a Claude subagent on Opus 5.5 and read-only codex on `gpt-5.6-sol`. The Quality Manager is never used to verify this plan.

READ-ONLY for the repository. Do not modify repository files, run state-changing git commands, or run the QM, any chain or any Drive against this repository. For execution such as tests, mutation checks or probes, use a private clone: `git clone --no-hardlinks /Users/cosmos/Projects/cosmonauts <scratch>/repo`, then check out `feature/qm-chain-safety`. Never use `git worktree add`. If your sandbox does not allow writes, inspect instead and say so.

Repository: /Users/cosmos/Projects/cosmonauts, branch `feature/qm-chain-safety`. The change is the diff `5b8889c..HEAD`: the D-036 record commit plus the TASK-766 implementation commit. Read `missions/tasks/TASK-766*.md`, plan D-036, the amended D-005, D-019, B-011, and spec AC-014 and AC-016 in `missions/plans/qm-chain-safety/`.

The ruling, in the user's words: "I want to freely set whatever model is available to Pi. No constraint, no advisory, nothing." Meaning:
- Model-family diversity is removed from the QM product entirely. There is no family check, no alias table, no "not configured", "same-family" or human-decision item about the reviewer model, and the verdict never depends on which models are used.
- The QM and its reviewers may use any model Pi can reach. `qualityReview.diverseReviewerModel` was renamed to the neutral, optional `qualityReview.reviewerModel` (generalist override only). `modelFamilies` is gone.
- Kept on purpose: the host-owned `## Reviewer models` section records host-observed `lens: provider/id`, and `assertQualityReviewModelIdentity` treats a session whose model changed after host resolution as an integrity failure. That is evidence integrity, not a model constraint. Say whether you agree.
- Out of scope: this plan's own coordination practice of cross-model review channels (D-002, D-033, D-034). That is process, not product.

Questions:
1. **Is any model-family coupling left** anywhere live: code, prompts, agent definitions, config and its validation, docs, skills, external commands and skills, tests other than the new negative pin? That includes indirect coupling: a default-implementer model lookup, a report line, a human item, a verdict branch, a prompt instruction to mark model configuration as not configured, or a test fixture that still needs a reviewer model to reach `ready`. Historical plan and task text with dated supersession notes is not a finding.
2. **Did the removal break anything?**
   - Does the `reviewerModel` override still reach only the generalist through the real spawn path?
   - Does an unset reviewer model mean the shipped models are used, with no item?
   - Are D-019's `checks` half, the D-031/D-032 floors, D-025 host-verified `ready`, D-026 ordering and INV-001..005 intact?
   - Did any test lose meaningful coverage when its diversity setup lines were deleted?
   - Does the new test in `tests/orchestration/quality-review-run.test.ts` ("reaches ready with ... and records the model only") fail when a model-dependent item or verdict branch is reintroduced? Mutation-check it in your clone.
   - Does an old config that still carries `diverseReviewerModel` or `modelFamilies` behave safely?
3. **Gates.** Run in your clone if you can: test, lint, typecheck, `check:reachability`, `check:suppressions -- --base main`, and `bun bin/cosmonauts plan check-artifacts qm-chain-safety`.

Threat model (D-027): accidental damage only; list hostile-only routes in one line. The limits recorded in D-031, D-032 and D-035 are not findings.

Output:
- findings ranked HIGH/MEDIUM/LOW, each with file:line and an accidental failing scenario;
- a one-line answer to question 1, and one to question 2;
- residuals;
- a verdict: SHIP or DO-NOT-SHIP-YET.
