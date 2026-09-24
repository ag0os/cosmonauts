---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: focused, 0f6a919..(TASK-744 ed9c674)
date: 2026-09-24
---

# Mid-branch review 9 — codex

The prompt is `mid-review-9-prompt.md`. Final message verbatim:

## Round-8 resolutions

| Finding | Status | Evidence and pre-TASK-744 test check |
|---|---|---|
| Codex MEDIUM: failed preparation erases a completed audit’s findings | **RESOLVED** | The runner now preserves an observed failing audit and copies its findings into the report ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:337), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:361)). The new indexed and unindexed test asserts the finding appears ([test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3359)). On the pre-TASK code, preparation failure replaced the audit state and emptied the findings, so that assertion would fail. |
| Codex LOW: settle-grace timer remains live | **RESOLVED** | The timer is cleared after the race ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:458)). The new test checks that no 60-second timer remains ([test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3447)); the pre-TASK code never cleared it, so the test would fail. |
| Claude LOW: unindexed report retains the QM’s gate claim | **RESOLVED** | Failed preparation now replaces the unindexed Gates section with the host-observed state ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:921), [report.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-report.ts:199)). The unindexed test rejects the QM’s claimed pass ([test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-run.test.ts:3438)); the pre-TASK code appended the host line and would fail that assertion. |

These pre-TASK checks are based on the base revision’s source and test assertions; I did not execute tests in this read-only review.

## New finding

- **HIGH — Failed analysis preparation can produce a `ready` report.** When the audit nevertheless returns `completed-bound`, [observedGateState](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:337) preserves that state. [hostBlocksReady](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:835) does not check `analysisPreparationFailed`; the preparation failure is added as a human-decision item only afterward ([run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:822), [run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:905)). Accidental scenario: a frozen-lockfile preparation fails, an available analyzer completes the bound audit, and project checks pass with no other blocking item. The final and plan-summary reports can say **`ready`** while also saying **“Analysis preparation failed; human decision required.”** The changed launch test misses this because its package change supplies a separate blocking item ([test](/Users/cosmos/Projects/cosmonauts/tests/orchestration/quality-review-launch.test.ts:771)). This undermines the recorded preparation result under D-026 and permits sign-off despite an unresolved human decision.

## Residuals

Unranked hostile-only routes: deliberate rewriting of sealed materials or the base export, deliberate process-group escape and tampering, and deliberate package-manager registry redirection. Host-run checks executing reviewed code with operator authority are accepted under D-028.

**Verdict: DO-NOT-SHIP-YET for Stages 1–6.** The new `ready` path needs a blocking condition and a test where preparation failure is the *only* blocker. The repository’s `analysis_status` capability was unavailable, so this conclusion rests on read-only source and diff inspection.
