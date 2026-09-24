---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: focused, 8487991..(TASK-745 237a3d9)
date: 2026-09-24
---

# Mid-branch review 10 — codex

The prompt is `mid-review-10-prompt.md`. Final message verbatim:

## Round-9 HIGH

| Finding | Resolution | Evidence |
|---|---|---|
| Failed analysis preparation plus a bound audit could yield `ready` | **RESOLVED** | The runner now collects all host human-decision items, including failed analysis preparation, before computing the verdict. Any item blocks `ready`, and the same list is merged into the report ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:815), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:836)). The indexed and unindexed launch fixtures make preparation failure the only blocker and assert `not-ready` ([launch test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-launch.test.ts:713)). On pre-TASK-745 code, that fixture would report `ready`: the old blocker check omitted `analysisPreparationFailed` and added its human item only after deciding the verdict. This is a source-based check; I did not run tests in this read-only review. |

**Structural guard:** In the host-check success path, no host human-decision item can coexist with `ready`: the list tested at [run.ts:843](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:843) is the list rendered at [run.ts:832](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:832). Failure paths set `failed` or `refused`. Failed preparation is recorded in checks and the human-decision section, consistent with D-026; the bound audit remains recorded as host-observed gate state, consistent with D-025.

## New findings

- **LOW — One synthetic test cannot detect this regression on its own.** The “analysis preparation failure” row mocks every call to `preparePrivateReviewWorkspace` as a failure ([run test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:406)). The later check preparation call therefore fails too ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:742)), independently blocking `ready`. If the analysis-preparation guard were accidentally removed, this row would remain green. The separate real launch test does isolate and cover the regression.
- **LOW — The new bound-failing-audit test has an independent configuration blocker.** It writes configuration after `root(true)` creates the base commit, without committing the new config ([run test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:460)). The host reads configuration from that base ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:1370)), so missing checks and model configuration also block `ready`. If handling of a bound failing audit accidentally stopped blocking the verdict, this test’s `not-ready` assertion could still pass.

No new production correctness or liveness defect was found in `8487991..HEAD` outside those test gaps. Report merging and finalization touched by the diff preserve the computed verdict.

**Residuals, unranked hostile-only routes:** deliberate tampering with sealed materials or the base export, process-group escape and tampering, and registry redirection. D-028 accepts host-run checks executing reviewed code with operator authority.

**Verdict: SHIP Stages 1–6.** The round-9 HIGH is closed. The two LOW test gaps do not remove the separate isolated regression coverage. This was a read-only source review; tests and chains were not run.
