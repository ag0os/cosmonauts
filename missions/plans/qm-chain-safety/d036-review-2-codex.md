# D-036 review 2 — codex channel (gpt-5.6-sol, high, read-only), full final message

## Findings

- HIGH: None.
- MEDIUM: None.
- LOW: None.

No accidental failing scenario remains reproducible within the requested scope.

## Dispositions

| Item | Disposition | Evidence |
|---|---|---|
| F-1 — slash-bearing IDs rejected | RESOLVED | Validator now permits slashes after the first separator in [loader.ts:219-227](/Users/cosmos/Projects/cosmonauts/lib/config/loader.ts:219). The positive case is pinned at [loader.test.ts:107](/Users/cosmos/Projects/cosmonauts/tests/config/loader.test.ts:107). Restoring the old regex makes that test fail. |
| F-2 — legacy keys silently ignored | ACCEPTED | Only current fields are returned by [loader.ts:243-262](/Users/cosmos/Projects/cosmonauts/lib/config/loader.ts:243). Run 4 records that the legacy keys never reached `main` and are safe to ignore under D-036 at [closure-e2e.md:82](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/closure-e2e.md:82) and [closure-e2e.md:95](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/closure-e2e.md:95). History searches on local `main` found no legacy-key commits. |
| F-3 — mismatch verdict not pinned | RESOLVED | The matrix now includes configured `anthropic/reviewer` with observed `openai-codex/worker` at [quality-review-run.test.ts:1600](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1600), and still requires `ready` at [quality-review-run.test.ts:1678](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:1678). Injecting a mismatch-dependent `not-ready` branch makes this case fail. |
| UR-001 — legacy keys ignored silently | ACCEPTED | Same disposition as F-2; recorded explicitly in [closure-e2e.md:92](/Users/cosmos/Projects/cosmonauts/missions/plans/qm-chain-safety/closure-e2e.md:92). |
| UR-002 — slash-bearing IDs rejected | RESOLVED | Same remediation and mutation evidence as F-1. |
| UR-003 — invalid-model error omitted format | RESOLVED | Error now names `<provider>/<model-id>` at [loader.ts:225](/Users/cosmos/Projects/cosmonauts/lib/config/loader.ts:225), pinned at [loader.test.ts:122](/Users/cosmos/Projects/cosmonauts/tests/config/loader.test.ts:122). |

TASK-767 introduced no functional regression found. Direct probes confirmed rejection of:

- Missing slash: `provider-id`
- Empty provider: `/id`
- Empty ID: `provider/`
- Whitespace in either component, including trailing newline/tab

Nested IDs such as `provider/id/child` remain accepted. Across Pi 0.80.6’s full 1,057-model built-in catalog—including 588 slash-bearing IDs—zero values were rejected by the validator and zero failed Cosmonauts `resolveModel`.

Question 1, one line: **No model-family or model-choice constraint remains on a live surface; the resolved-versus-observed identity check at [quality-review-context.ts:34](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-context.ts:34) is evidence integrity, not model selection policy.**

The neutral override still reaches only `coding/reviewer` at [quality-review-models.ts:1](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:1), while documentation explicitly says model choice never affects the verdict at [orchestration.md:86](/Users/cosmos/Projects/cosmonauts/docs/orchestration.md:86).

## Gates

All passed in the clean private clone:

- Tests: 262 files, 3,435 tests
- Lint: 600 files
- Typecheck
- Reachability: 198/198 runtime modules; 13 type-only exemptions
- Suppressions against local `main`
- Plan artifacts: 0 issues

Residuals:

- Only the generalist has the optional override; specialists retain shipped definitions. This is the recorded D-036 scope.
- Legacy keys remain silently ignored, with the explicit ACCEPTED disposition above.
- The structured `analysis_status` capability was unavailable in this reviewer session; it was not one of the requested gates.
- The source checkout was clean initially. During review, an unrelated untracked `d036-review-2-claude.md` appeared; I did not read or modify it. Source HEAD, index, and tracked diff remained unchanged. The mutation clone was restored clean.

**Verdict: SHIP.**
