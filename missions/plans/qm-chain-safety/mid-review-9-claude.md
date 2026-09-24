---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: focused, 0f6a919..(TASK-744 ed9c674)
date: 2026-09-24
---

# Mid-branch review 9 — Claude reviewer (coordinator condensation)

**Verdict: DO-NOT-SHIP-YET.**

All three round-8 findings are RESOLVED. For each one, the reviewer reverted the fix in a scratch copy and confirmed the new test fails without it: 4/4 fail on the old code, and 104/104 pass on HEAD.

## New finding

**HIGH (a regression from TASK-744): a failed analysis preparation can now end in `ready`.**
- `observedGateState` (`run.ts:337`) keeps `completed-bound`.
- `hostBlocksReady` (`run.ts:835-848`) never checks `analysisPreparationFailed`.
- The "Analysis preparation failed; human decision required." item is added after the verdict has already been set (`:816`, `:828-831`).
- **Accidental scenario:** a dependency is added without updating `bun.lock`. The frozen install fails, but the audit still completes bound and the checks pass.
- **Reproduced:** `scratchpad/mid9/probe-ready.ts` gives `Verdict: ready` for both indexed and unindexed reports. The pre-TASK-744 code gives `not-ready`.
- **Why the tests missed it:** the launch test's fixture makes `package.json` gate-owned, which forces `not-ready` on its own. The run test uses a `fail` gate.
- **Fix:** block `ready` on `analysisPreparationFailed`, and add a test where that is the only blocker.

Hostile-only residuals: rewrites after the seal, escaping the process group, and registry redirection.
