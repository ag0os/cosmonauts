---
id: TASK-781
title: 'Stage 14: Characterize runPass'
status: To Do
priority: high
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-780
createdAt: '2026-09-28T15:26:34.808Z'
updatedAt: '2026-09-28T15:26:34.808Z'
---

## Description

Land the dedicated green characterization commit for `runPass` before its high-risk refactor. This task verifies B-005 and B-010 and is a Q-002 escalation boundary.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified at characterization level for `runPass` through its existing shipped/recovery entry points, pinning success, failure, cancellation, recovery, and persisted-artifact behavior before any edit; B-010 is verified through a green characterization-only stage, freeze check, and hard-stop behavior.
- [ ] #2 The owned `runPass` result matrix covers every Design §4 outcome: dry-run performs no mutation/lock; persisted recovery success returns recovered state and failure returns `kind: "failed"` with recovery reason in `details`; incomplete inventory is reported; accepted-receipt replay is idempotent; deterministic no-op/proposal/retirement preserve artifacts; unusable pressure and bounded deferrals retain variants; full-model success, invalid/missing judgment provider, and abort retain variants; proposal/observation/retirement caps retain counts; episode finalization and receipt materialization retain files; post-commit later failure retains `writesCommitted`; lock timeout returns failed with `details.recovery: "concurrent-mutation"`; unconfirmed release returns failed with `recovery: "release-unconfirmed"`. Owned Files to Change entries are new tests under `tests/`; `lib/memory/living-memory.ts` is observed but not edited.
- [ ] #3 D-009/D-016 are satisfied: `runPass`’s partial tier triggers this separate green characterization commit; variants come from its signature/return sites and tests assert durable outcomes rather than helpers; exact files/cases are recorded for stage 15; and this task does not edit `runPass` or any owned critical function. If only a testability seam can expose an outcome, it is added and named in this characterization commit; otherwise the best writable characterization plus full suite is recorded as the human-approved residual-risk bound.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to the known provider symbol-trace failure: fresh complexity metrics and the successful containing-file reachability trace are recorded; no failed trace is misreported as unresolved. Before every edit the Pi-hosted worker runs `analysis_status`, uses the project analysis surface, and stops/reports if tools are unavailable (D-017).
- [ ] #5 Characterization pins one state owner’s write-through `details`, `writesCommitted`, and `episodePrunes`; correctness rehydrates from receipts, proposals, retirements, and source stores, and no empty in-memory accumulator fabricates restart state. Evidence chain, bounded work, non-destructive curated data, recovery/cancellation/error contracts, and the pending nine-group/174-line living-memory family remain unchanged.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP plus the pending living-memory duplication surface/diagnostic pair are re-run and recorded for `runPass` at this characterization commit.
<!-- AC:END -->
