---
kind: independent-review
plan: qm-chain-safety
channel: Claude subagent reviewer (general-purpose, read-only)
scope: Stage 7, 8e68ae8..(0ffaa48)
date: 2026-09-24
---

# Stage 7 review 1 — Claude reviewer (coordinator condensation)

**Verdict: DO-NOT-SHIP-YET.** B-011 diversity is sound and fails safe, and there are no regressions in Stages 1–6. B-010 host enforcement can be bypassed by ordinary behavior.

The reviewer ran 135/135 tests, probes, 9 mutations and a Fallow audit (no issues). `anthropic/claude-sonnet-5` resolves in Pi 0.80.6, and its family (anthropic) differs from the default worker's (openai).

## Findings

**MEDIUM-1: the P1 cap relies on the QM reusing reviewer IDs** (`quality-review-models.ts:114,141`).
- A QM that renumbers the finding shows P1 next to a host note saying it was capped.
- A QM that raises a reviewer P2 to P1 under a new ID is not detected at all.

**MEDIUM-2: "measured cost" accepts any code line of 12 or more characters that contains a digit** (`:156,168`). For example, a quoted `for (let i = 0; …)` counts as measured cost.

**MEDIUM-3: the generalist model wiring is untested.** Mutations that revert it to `params.model` in `spawn-tool.ts:871`, or drop `diverseReviewerModel` from the QM context, survive the tests. A regression would fail visibly, but only at runtime.

**LOW:**
- A missing `implementerModel` skips the diversity check instead of failing (`run.ts:722`). Only the injected `execute` path reaches it.
- The `modelFamilies` wiring is untested (`run.ts:726`).
- The "not configured" diversity item is duplicated on the unindexed path (`run.ts:844`).
- A missing generalist is labelled "unresolvable".
- One tamper test now passes on a failure path: its `test/other` fixture model counts as unresolvable.

## Holding

- same-family, substituted or unresolvable models fail;
- D-019 applies to unconfigured diversity;
- identities come from host-sealed metadata;
- the override applies to `coding/reviewer` only;
- D-026 and D-025 are unchanged;
- the audit passes.

## Hostile-only residuals

- `full.diff` is re-read after checks without re-verifying its digest;
- measured-cost and closure-evidence quotes can be faked;
- lenses can collude to close each other's findings.
