---
title: >-
  QM chain safety: a review-only Quality Manager that cannot damage what it
  reviews
status: active
createdAt: '2026-09-23T20:56:11.879Z'
updatedAt: '2026-09-23T20:56:11.879Z'
---

## Overview

Seed plan for the spec in `spec.md`: a review-only Quality Manager that cannot
damage what it reviews, run-owned records, and gates that judge only what a
change introduced. The planner fills in Behaviors, Design, Files to Change, Risks,
Quality Contract and Implementation Order during `/spec-to-backlog`. The
Decision Log entries below are already decided and carry forward.

## Decision Log

- **D-001 - Eight decisions from the qm-chain-safety investigation**
  - Decision: accepted as recommended in `.shepherd/work/todo/qm-chain-safety/investigation.md` §5:
    1. The QM is review-only. Remediation goes through tasks, Drive and independent review.
    2. Full reports go to run-scoped artifacts, with a tracked plan-scoped summary on every exit. The shared `missions/reviews/*-round-N.md` files are retired to an archive.
    3. Isolation is a detached worktree now, with runner support after it. An OS sandbox is deferred.
    4. Changed-scope gates fail only on introduced findings, using the committed baselines. The doc conflict between `docs/fallow-exceptions.md` and `analysis-debt-paydown` gets resolved.
    5. A new suppression directive needs an exception-registry entry, and only a human adds one.
    6. A performance P1 needs a measured or reproduced cost. A lens is never the only judge that closes its own finding.
    7. The final review includes a reviewer on a different model family from the implementer.
    8. `chain_run` enforces the caller's `subagents` allowlist.
  - Alternatives: the incident report's ranked recommendations as written (a pure-code triage filter, protected-test replay, an edit-range diff gate), rejected for the reasons in `investigation.md` §2. Keeping QM remediation behind added gates was also rejected: on 2026-09-23 only 1 of 6 fixer runs was clean.
  - Why: INV-001..INV-005 (spec `## Intent`).
  - Decided by: human, 2026-09-23 (relayed by Shepherd)

- **D-002 - This plan is not verified by the Quality Manager**
  - Decision: where `/implement-plan` calls the QM, substitute an independent review on a different model from the implementer: a Claude subagent reviewer plus `codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only`, framed as correctness/liveness. Implementation workers run on codex `gpt-6-sol` at medium effort.
  - Alternatives: run the QM as `/implement-plan` normally does (rejected: the QM is the thing being fixed, and today it can mutate the tree it reviews).
  - Why: INV-001. A verifier that can damage the work cannot certify the fix for that damage.
  - Decided by: human, 2026-09-23 (relayed by Shepherd, coordinator brief)
