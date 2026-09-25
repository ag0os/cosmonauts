# D-036 review 1 — codex channel (gpt-5.6-sol, high, read-only), full final message

## Findings

**HIGH — None.**

**MEDIUM — F-1: `reviewerModel` rejects many valid Pi models.**  
[`lib/config/loader.ts:219`](/Users/cosmos/Projects/cosmonauts/lib/config/loader.ts:219) permits exactly one `/`, while Cosmonauts/Pi splits at the first slash and treats the remainder as the model ID ([`model-resolution.ts:102`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/model-resolution.ts:102)). The pinned Pi 0.80.6 catalog contains 588 slash-bearing IDs among 1,057 models. Probe:

- `openrouter/ai21/jamba-large-1.7` resolves successfully.
- `parseQualityReviewConfig({ reviewerModel: ... })` throws `Invalid qualityReview.reviewerModel`.

Accidental failure: an operator selects a valid reachable OpenRouter-style model and configuration loading prevents the QM from running. This directly violates “whatever model is available to Pi.” Pi’s current official documentation also shows slash-bearing OpenRouter IDs in its [model configuration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md).

**LOW — F-2: the new negative pin does not catch every model-dependent verdict branch.**  
The matrix at [`quality-review-run.test.ts:1587`](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1587) covers unset, same-provider, and other-provider models, but every configured case makes the configured and observed identities equal. I reintroduced a “configured model differs from observed model → fail” branch; all three named tests still passed.

Accidental failure: a future merge restores a substitution or alias-based verdict check, but the required negative pin remains green. The missing-model mutation was caught correctly.

## Direct answers

**Q1 — No:** no live model-family coupling remains in code, prompts, definitions, config, docs, skills, commands, or tests outside the intentional negative pin; remaining hits are historical records.

**Q2 — Not fully:** the product removal is otherwise intact, but valid slash-bearing Pi models are rejected, and the replacement negative test does not cover every forbidden verdict branch.

The rest checks out:

- `reviewerModel` flows from base config through [`quality-review-launch.ts:328`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:328) and reaches only `coding/reviewer` through [`quality-review-models.ts:1`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:1) and [`spawn-tool.ts:869`](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/spawn-tool.ts:869). `undefined` falls back to the shipped agent definition.
- Unset configuration creates no model item. Old `diverseReviewerModel` and `modelFamilies` keys are accepted but ignored; the parser probe retained only `checks`. That is safe under D-036, though silent.
- D-019’s checks-only item remains at [`quality-review-run.ts:942`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:942).
- D-025 host-verified readiness and D-031/D-032 floors remain in [`quality-review-run.ts:812`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:812).
- D-026 ordering remains assessment → sealed evidence → checks → host verdict at [`quality-review-run.ts:1322`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1322).
- INV-001..005 coverage remains green.
- Deleted setup lines were obsolete diversity prerequisites. No unrelated behavioral coverage disappeared, apart from F-2’s incomplete replacement negative.
- I agree that [`assertQualityReviewModelIdentity`](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-context.ts:33) and the host-owned model record are evidence-integrity controls, not model constraints.

## Gates

All requested gates passed in the clean private clone:

- Tests: 262 files, 3,433 tests.
- Lint and typecheck.
- Reachability: 198/198 runtime modules; 13 type-only exemptions.
- Suppressions against `main`.
- Plan artifacts: 0 issues.
- Changed-scope Fallow audit against `main`: pass; zero introduced dead-code, complexity, or duplication findings.

The source checkout was not modified by this review. A separate untracked [Claude channel report](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/d036-review-1-claude.md:1) appeared during execution and independently reports the same blocking validator issue.

Residuals: completed historical task records retain superseded diversity prose; only the generalist has the new config override, while the QM and specialists retain shipped defaults; D-031/D-032/D-035’s recorded heuristic limits remain unchanged.

Hostile-only: deliberately malicious reviewed code may tamper with host/material/Git state or escape its process group, per D-027.

**Verdict: DO-NOT-SHIP-YET.** Fix F-1 and add a slash-bearing-model test. F-2 should also be closed to satisfy the stated mutation requirement.
