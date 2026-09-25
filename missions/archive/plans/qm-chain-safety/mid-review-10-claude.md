---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: focused, 8487991..(TASK-745 237a3d9)
date: 2026-09-24
---

# Mid-branch review 10 — Claude reviewer (coordinator condensation)

**Verdict: SHIP for Stages 1–6.** The round-9 HIGH is RESOLVED. No new HIGH or MEDIUM findings.

**Round-9 HIGH (analysis-prep failure plus a bound audit gave `ready`): RESOLVED.**
- All host human items are assembled before the verdict is decided (`run.ts:815-846`). The list the report renders is the same list that blocks `ready`.
- The `probe-ready` reproduction now gives `not-ready` for both indexed and unindexed reports.

**Mutation checks:**
- The pre-TASK-745 code fails both new launch tests.
- Removing the guard makes 5 tests fail.

**Structural guard:** no host human-decision item can coexist with `ready`.
- The failure path always ends in `failed`.
- Final annotations only lower a verdict; they never raise it.
- A human item the reviewer writes itself also blocks `ready`, through `hostResultsBlockReady`.

**LOW:** the run-test row "never reports ready … analysis preparation failure" (`quality-review-run.test.ts:401-417`) cannot fail on its own. Its mock makes every preparation call fail, so the check-count mismatch blocks `ready` independently.

**Hostile-only residuals:** rewrites after the seal, escaping the process group, and registry redirection.
