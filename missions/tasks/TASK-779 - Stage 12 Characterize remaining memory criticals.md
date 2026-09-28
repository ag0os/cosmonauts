---
id: TASK-779
title: 'Stage 12: Characterize remaining memory criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-772
createdAt: '2026-09-28T15:25:50.870Z'
updatedAt: '2026-09-28T15:25:50.870Z'
---

## Description

Land characterization-only coverage for the remaining below-high memory critical functions before their refactor. This task verifies B-005 and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified at characterization level for remaining memory paths by pinning their success, failure, recovery, locking, persisted-record, retrieval, validation, and conflict outcomes before refactor; B-010 is verified through a green characterization-only stage and freeze check.
- [ ] #2 Owned functions are `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, and `candidateConflict`; signatures/return sites are enumerated into named variants and durable fields, with branch-count variants for `isEpisodePruneJournal` and `candidateConflict` and the proposals/receipts clone context pinned inside `readProposalMaterializations`. Owned Files to Change entries are new test files under `tests/`; observed-but-unedited production entries are relevant files among `lib/memory/{consolidation-proposals,consolidation-receipts,consolidation-sources,durable-files,episode-transition-lock,episode,knowledge-records,knowledge-store,living-memory,markdown-store,okf,proposal-files,retirement-receipts,retirement-store}.ts`.
- [ ] #3 D-009/D-016 are satisfied: the `static_estimated` below-high tier triggers this separate green characterization commit; exact cases/files are recorded for stage 13; tests assert public/recovery/durable effects rather than helper calls; and this task does not edit any owned critical function or owned production module. High-tier `readRetirementReceiptInventory` and `collectConsolidationSources` remain unchanged under existing coverage. The living-memory same-file family remains pending stage 15.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, reconfirms each owned complexity finding and the pending proposal/receipt clone location through the analysis surface, and stops and reports if tools are unavailable (D-017).
- [ ] #5 Characterization preserves the evidence chain, persisted recovery state, bounded work, non-destructive curated data handling, lock semantics, trust boundaries, TOCTOU/error ownership, and rehydration from persisted stores. It adds no production seam/export/configuration/dependency change except any testability seam expressly named in this characterization commit as allowed by the plan.
- [ ] #6 D-015 records slice-start `S` and outputs of `git diff --name-status --diff-filter=MDR S HEAD -- tests/` and `git diff -U0 S HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; only added test files are allowed without escalation. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; project-scope cyclomatic, cognitive, and CRAP capabilities are re-run and recorded for all six owned functions.
<!-- AC:END -->
