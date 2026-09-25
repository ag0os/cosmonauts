---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: Stage 7, 8e68ae8..(0ffaa48)
date: 2026-09-24
---

# Stage 7 review 1 — codex

The prompt is `stage7-review-1-prompt.md`. Final message verbatim:

## Stage 7 verdict: **DO-NOT-SHIP-YET**

The model selection path is sound for this repository: Pi 0.80.6 resolves `anthropic/claude-sonnet-5` and `openai-codex/gpt-5.6-sol`, and the shipped aliases place them in different families. I found no Stage 7 regression in base-owned config, host-verified gate blocking, D-026 ordering, or the cited execution-liveness contracts. The changed-scope Fallow audit passed. The blockers are in B-010 calibration.

### Findings

1. **HIGH — An unsupported P1 survives when the QM report has no machine index.** [quality-review-run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:882) supplies an empty findings list to calibration when the index is absent. If the performance reviewer reports `PF-2` as P2 but the QM’s otherwise valid, unindexed report lists it as P1, [unsupportedP1](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:166) sees neither a reviewer P1 nor a reported P1 and leaves it unchanged. An absent index is an allowed report state. **Breaks B-010 / AC-013.**

2. **MEDIUM — A numeric quotation is accepted as measured cost without describing a cost.** [citedMaterial and unsupportedP1](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:148) require only a 12-character substring of `full.diff` containing a digit. I reproduced acceptance of `measuredCost: const BATCH_SIZE = 100000;` as support for P1. An accidental reviewer misreading a numeric code constant therefore passes host calibration despite the stronger prompt instruction. **Breaks B-010 / AC-013 under D-026.**

3. **MEDIUM — QM-only dismissal is outside the closure check.** [calibrateReviewerFindings](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:109) checks `status: resolved|dismissed` in reviewer artifacts, but [report calibration](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:882) does not check a dismissal made during QM synthesis. I reproduced a reviewer finding with no status producing zero calibration issues when the report omits it. With passing gates and checks, a QM could accidentally dismiss that finding based only on its originating lens and report `ready`. The prompts prohibit this; host enforcement does not catch it. **Breaks B-010 / AC-013.**

4. **LOW — Finding IDs can collide during priority correction.** [quality-review-models.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:140) uses substring matching. I reproduced unsupported `PF-1` causing a separately measured `PF-10` to be changed from P1 to P2. **Breaks B-010’s report calibration.**

5. **LOW — The same-family test cannot exercise its named branch.** [quality-review-models.test.ts](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-models.test.ts:39) configures `anthropic/reviewer` but observes `openai/reviewer`. The substitution condition in [quality-review-models.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-models.ts:91) fails first, so removing the subsequent same-family check would leave that test passing. **Leaves B-011 / AC-014 without a direct regression test for same-family enforcement.**

**Residuals, unranked (D-027/D-028):** A deliberately hostile reviewed change can use host-run preparation or checks to tamper with the host, materials, workspace, or Git objects.

This was a read-only review: I did not run QM, chains, drive, or the test suite. The Fallow audit reported no issues and the working tree remained clean.
