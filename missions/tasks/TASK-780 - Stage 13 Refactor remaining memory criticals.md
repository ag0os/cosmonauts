---
id: TASK-780
title: 'Stage 13: Refactor remaining memory criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-779
createdAt: '2026-09-28T15:26:11.527Z'
updatedAt: '2026-09-28T15:26:11.527Z'
---

## Description

Refactor the remaining memory critical functions and extract the proposals/receipts clone family. This task verifies B-004, B-005, and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified for `recoverAcceptedEpisodeFinalization`, `applyUnderLock`, `retrieveKnowledge`, `readProposalMaterializations`, `isEpisodePruneJournal`, `candidateConflict`, `readRetirementReceiptInventory`, and `collectConsolidationSources`, preserving memory/recovery/persisted behavior while functions/helpers fall below thresholds. B-004 is verified for the consolidation-proposals/consolidation-receipts family inside `readProposalMaterializations`, which disappears from duplication evidence. B-010 is verified by the gate/freeze check.
- [ ] #2 Owned Files to Change entries are the applicable files among `lib/memory/{consolidation-proposals,consolidation-receipts,consolidation-sources,durable-files,episode-transition-lock,episode,knowledge-records,knowledge-store,living-memory,markdown-store,okf,proposal-files,retirement-receipts,retirement-store}.ts`, plan-approved focused internal helpers, and no tests after TASK-779. `recoverAcceptedEpisodeFinalization` is refactored here, but its living-memory same-file clone instances remain untouched for stage 15 with `runPass`.
- [ ] #3 D-009/D-016 and Design §4 are satisfied: exact TASK-779 cases are named before edit; all metrics and clone locations are freshly confirmed. Non-exported helpers are cyclomatic ≤9/cognitive ≤14 when test-reachable or cyclomatic ≤4/cognitive ≤14 when their file is not imported by tests; exported entry points retain measured tier, no helper is exported merely for tier, and planned helper counts/target cyclomatic are recorded. `isEpisodePruneJournal` and `candidateConflict` reduce branch count into cyclomatic-9 units. Failure to meet ceilings permits only a further named characterization-seam commit; otherwise the task blocks/escalates, never baselines a production critical.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, uses fresh complexity and exact-location clone tools, and stops and reports if unavailable (D-017).
- [ ] #5 The refactor retains one state owner, persisted-store rehydration, evidence chain, bounded work, non-destructive handling, locking, TOCTOU, record validation, and distinct trust/error ownership. D-008 allows only the narrowest proposals/receipts seam. D-012 records surface duplication separately from direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]`; any surviving owned family fails, while the living-memory family remains explicitly pending stage 15.
- [ ] #6 D-015 records slice-start `S`, characterization commit `C` from TASK-779, and outputs of `git diff --name-status --diff-filter=MDR C HEAD -- tests/` and `git diff -U0 C HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; additions belong in `C` only. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; cyclomatic/cognitive/CRAP and project-scope duplication with D-012 diagnostic pairing are re-run and recorded, with all eight functions/helpers below ceilings and the proposals/receipts family absent.
<!-- AC:END -->
