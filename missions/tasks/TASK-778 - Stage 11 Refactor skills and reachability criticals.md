---
id: TASK-778
title: 'Stage 11: Refactor skills and reachability criticals'
status: To Do
priority: medium
labels:
  - backend
  - testing
  - 'plan:project-health-audit'
dependencies:
  - TASK-777
createdAt: '2026-09-28T15:25:33.131Z'
updatedAt: '2026-09-28T15:25:33.131Z'
---

## Description

Refactor skills/reachability criticals and extract the exporter clone family after characterization. This task verifies B-004, B-005, and B-010.

<!-- AC:BEGIN -->
- [ ] #1 Behavior verification: B-005 is verified for `runHarnessSync`, `groupCatalogue`, `enhancedRows`, and `visit`, preserving sync/catalogue/reachability outcomes while functions/helpers fall below thresholds; B-004 is verified for the `lib/skills/exporter.ts` same-file family at former instances 467-475 and 484-492 inside `groupCatalogue`, which disappears from surface/diagnostic/trace evidence; B-010 is verified by the stage gate and freeze check.
- [ ] #2 Owned Files to Change entries are `cli/harness/subcommand.ts`, `lib/skills/exporter.ts`, `scripts/check-reachability.ts`, plan-approved focused internal helpers, and no tests after TASK-777’s characterization commit. `visit` continues to produce the same verdict for current `missions/architecture/staged-code.toml`; the exporter extraction remains private/narrow and preserves catalogue ordering, rows, errors, and public signatures.
- [ ] #3 D-009/D-016 and Design §4 are satisfied: TASK-777’s exact cases and seam, if any, are named before edit; fresh complexity metrics and the current clone location are traced. Non-exported helpers are cyclomatic ≤9/cognitive ≤14 in test-reachable files; in the non-imported reachability script they are cyclomatic ≤4/cognitive ≤14; exported entry points retain their measured tier (about cyclomatic 27 at high), and no helper is exported just to gain tier. Planned helper counts and target cyclomatic are recorded. If ceilings cannot be met, only a further named characterization-seam commit is allowed; otherwise the task blocks/escalates and no production critical is baselined.
- [ ] #4 Ratified constraints apply verbatim and are stop-and-escalate ground: refactors are behavior-preserving (INV-002); no new lint or fallow suppressions, no threshold, ignore, entry, or fallow.toml changes (INV-004); a finding is traced through the analysis surface immediately before the edit and a non-reproducing finding is reported unresolved, never fixed (INV-003); any test expectation change hard-stops for human review (Q-002). D-013 applies to failed traces. Before every edit the Pi-hosted worker runs `analysis_status`, uses fresh complexity and exact-location clone tools, and stops and reports if unavailable (D-017).
- [ ] #5 D-008 keeps the exporter family as the narrowest private same-file seam; dependency direction and measuring-instrument output remain unchanged. D-012 records project-scope duplication and direct diagnostic `fallow ["dupes", "--format", "json", "--quiet", "--no-cache"]` separately, and any surviving exporter family fails the stage. Any changed finding identity for an unchanged file or changed reachability verdict returns to this stage.
- [ ] #6 D-015 records slice-start `S`, characterization commit `C` from TASK-777, and outputs of `git diff --name-status --diff-filter=MDR C HEAD -- tests/` and `git diff -U0 C HEAD -- tests/ | grep -E '^\+.*\.(skip|only|todo)\('`; additions belong in `C` only. Any modified/deleted/renamed test or skip/only/todo addition cites the pinned finding and leaves the task blocked for independent human review. Rows are copied to `## Implementation Notes`; the worker performs no git operation on `missions/reviews/`, and the coordinator owns record-only custody.
- [ ] #7 Stage gate: `bun run test`, `bun run lint`, `bun run typecheck`, `bun run check:reachability`, and `bun run check:suppressions -- --base main` all exit 0; cyclomatic/cognitive/CRAP and project-scope duplication with D-012 diagnostic pairing are re-run and recorded, with all four functions/helpers below ceilings and the exporter family absent.
<!-- AC:END -->
